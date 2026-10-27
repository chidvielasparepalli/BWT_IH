import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulatorAvailable ? describe : describe.skip;
let env: RulesTestEnvironment;
suite('Firestore security rules (requires Firebase Emulator)', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-harvestlink', firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/buyer-1'), { uid: 'buyer-1', role: 'buyer', email: 'buyer@test.dev', name: 'Buyer', location: 'Test' });
      await setDoc(doc(context.firestore(), 'users/farmer-1'), { uid: 'farmer-1', role: 'farmer', email: 'farmer@test.dev', name: 'Farmer', location: 'Test' });
      await setDoc(doc(context.firestore(), 'products/active'), { farmerId: 'farmer-1', isActive: true, isDeleted: false, name: 'Tomato' });
      await setDoc(doc(context.firestore(), 'products/paused'), { farmerId: 'farmer-1', isActive: false, isDeleted: false, name: 'Paused' });
      await setDoc(doc(context.firestore(), 'products/limited-stock'), { farmerId: 'farmer-1', isActive: true, isDeleted: false, name: 'Limited stock', quantityAvailable: 5 });
    });
  });
  afterAll(async () => { if (env) await env.cleanup(); });
  it('lets a buyer read active public produce but not paused products', async () => {
    const buyer = env.authenticatedContext('buyer-1').firestore();
    await assertSucceeds(getDoc(doc(buyer, 'products/active')));
    await assertFails(getDoc(doc(buyer, 'products/paused')));
  });
  it('prevents clients from creating orders or mutating stock', async () => {
    const buyer = env.authenticatedContext('buyer-1').firestore();
    await assertFails(setDoc(doc(buyer, 'orders/forged'), { buyerId: 'buyer-1', farmerId: 'farmer-1', status: 'requested' }));
    await assertFails(setDoc(doc(buyer, 'products/active'), { farmerId: 'farmer-1', isActive: true, isDeleted: false, quantityAvailable: 999 }));
  });
  it('prevents self-promotion to admin', async () => {
    const buyer = env.authenticatedContext('buyer-1').firestore();
    await assertFails(setDoc(doc(buyer, 'users/buyer-1'), { uid: 'buyer-1', role: 'admin', email: 'buyer@test.dev', name: 'Buyer', location: 'Test' }));
  });

  it('serializes competing stock reservations atomically under Firestore transaction contention', async () => {
    await env.withSecurityRulesDisabled(async context => {
      const firestore = context.firestore();
      const productRef = doc(firestore, 'products/limited-stock');
      // Emulator data persists across test runs; reset stock and reservation documents for isolation.
      await deleteDoc(doc(firestore, 'testReservations/buyer-a'));
      await deleteDoc(doc(firestore, 'testReservations/buyer-b'));
      await setDoc(productRef, { quantityAvailable: 5 }, { merge: true });
      const reserve = (orderId: string, quantity: number) => runTransaction(firestore, async tx => {
        const snapshot = await tx.get(productRef);
        const stock = Number(snapshot.data()?.quantityAvailable ?? 0);
        if (quantity <= 0 || stock < quantity) throw new Error('Insufficient stock');
        tx.update(productRef, { quantityAvailable: stock - quantity });
        tx.set(doc(firestore, 'testReservations/' + orderId), { quantity });
        return quantity;
      });
      const outcomes = await Promise.allSettled([reserve('buyer-a', 4), reserve('buyer-b', 3)]);
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const finalStock = Number((await getDoc(productRef)).data()?.quantityAvailable);
      expect([1, 2]).toContain(finalStock);
      const savedA = await getDoc(doc(firestore, 'testReservations/buyer-a'));
      const savedB = await getDoc(doc(firestore, 'testReservations/buyer-b'));
      expect(Number(savedA.exists()) + Number(savedB.exists())).toBe(1);
    });
  });
});
