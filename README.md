# HarvestLink — HACK-P309

HarvestLink is a responsive farmer-to-buyer marketplace prototype for Telangana and Andhra Pradesh.

## Architecture

- **React + TypeScript + Vite** powers the buyer marketplace, farmer workspace and administrator console.
- **MongoDB Atlas** stores user profiles, farmer profiles, produce listings, orders, stock updates and moderation logs.
- **Node.js + Express** is the only app backend. It verifies signed API tokens and checks account roles/ownership server-side.
- **Passwords** are hashed with Node.js scrypt; the frontend never sends database credentials to the browser.
- **Product photos** are resized in the browser and stored with their product document as compressed WebP data URLs.
- **MongoDB transactions** protect checkout stock reservations and stock restoration on cancellation. Use Atlas or another MongoDB replica set.
- When `VITE_API_BASE_URL` is empty, the frontend remains available in **Local demo mode** using browser localStorage.

## Connect MongoDB Atlas (start here)

You do **not** need a Firebase project or Firebase service account to run the current HarvestLink app.

1. In Atlas, open your **CHIDVI** cluster and click **Connect → Drivers**. Select **JavaScript** and the **Node.js Driver**.
2. In Atlas **Security → Database & Network Access**, create/verify a database user and add your current IP address to Network Access.
3. From PowerShell on the project machine, run:

       cd A:\harvestlink
       powershell -ExecutionPolicy Bypass -File .\scripts\connect-mongodb.ps1

4. Copy the Atlas URI into the script's hidden-input prompt. If the URI still contains `<db_password>`, the script asks for the database-user password in another hidden prompt and URL-encodes it automatically. Use database name `harvestlink`. The script generates a private `TOKEN_SECRET`, writes `backend/.env` and `.env.local`, then pings Atlas. The URI, password and generated secret are not printed.
5. On success, open a second terminal and start the API:

       cd A:\harvestlink
       npm run api

6. Open another terminal for the frontend:

       cd A:\harvestlink
       npm run dev

7. Verify the backend at `http://localhost:4000/api/health`. It should return `ok: true` and `database: "mongodb"`.

Never send the MongoDB URI/password through chat, commit it, or put it in any `VITE_*` setting. Keep the URI only in `backend/.env`; that file is ignored by Git.

## Create an administrator

Public registration only accepts buyer/farmer roles. After the Atlas connection works, run this trusted terminal command to provision the admin account:

       cd A:\harvestlink
       npm run api:bootstrap-admin

Enter the desired admin email, name, location, and password when prompted. The password is hidden and stored as a hash. This creates or promotes that email's MongoDB account to admin; use a strong private password. Stop the API first if it is running with `npm run api`, run the command in a separate terminal, then restart the API if needed.

## Accounts and roles

Register buyer or farmer accounts through the app after MongoDB mode is active. Admin accounts are created by the terminal-only provisioning command.

- **Buyer**: browse active listings, maintain a basket, place orders and cancel eligible orders belonging to the buyer.
- **Farmer**: manage owned produce listings and fulfil only orders assigned to that farmer.
- **Admin**: manage the official marketplace catalog, fulfil admin-owned orders and moderate independent farmer listings with recorded reasons.

The API enforces these roles independently of the UI. Never expose the MongoDB URI or API signing secret to the frontend.

## Local demo mode

When `.env.local` is absent or `VITE_API_BASE_URL` is blank, the app uses the existing browser-local demo store. The seeded local demo password is `HarvestLink#2026`; it is for local demonstration only and should not be used for production accounts. Local demo data is not automatically copied into Atlas.

To use Atlas, configure the connection script and create accounts in MongoDB mode.

## Tests and checks

From the project root:

       npm run build
       npm test
       npm --prefix backend run check
       npm audit --prefix backend

The legacy Firestore rules/functions files remain in the repository for reference; they are not used by the current MongoDB mode.
