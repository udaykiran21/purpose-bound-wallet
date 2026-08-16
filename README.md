# Purpose-Bound Wallet POC

## Overview
The Purpose-Bound Wallet is a Proof of Concept (POC) digital wallet feature. It allows users to cryptographically lock a portion of their funds for a specific purpose or payee. This ensures that funds are reserved and prevents unauthorized spending (e.g., unauthorized game purchases on an unlocked device).

A secondary Step-Up Authentication method called the **"Vault PIN"** is required to authorize state changes to the locked funds. The underlying system uses a double-entry sub-ledger approach to logically separate `Available` balances from `Locked` balances while keeping track of `Total` funds.

## Tech Stack
- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL (with raw SQL, atomic transactions, and row-level pessimistic locking)
- **Frontend:** React (Vite), TypeScript, Tailwind CSS
- **Orchestration:** Docker & Docker Compose

## Repository Structure
This project is structured as a monorepo containing both the frontend and backend applications, orchestrated together with PostgreSQL via Docker Compose.

```text
purpose-bound-wallet/
├── backend/            # Node.js Express API (handles ledger logic and DB queries)
├── frontend/           # React Vite App (God Mode testing dashboard)
└── docker-compose.yml  # Orchestrates frontend, backend, and postgres services
```

## How to Run Locally

You only need Docker and Docker Compose installed to run this project.

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd purpose-bound-wallet
   ```

2. **Start the services:**
   Run the following command at the root of the repository:
   ```bash
   docker compose up --build -d
   ```
   This command spins up the Postgres database, installs dependencies, builds the Node.js backend, builds the React frontend, and links them across a shared Docker network.

   *Note: On the very first startup, the backend will automatically execute an initialization script to create the required database tables (`wallets`, `purpose_bound_contracts`, `ledger_entries`) and seed a default user wallet.*

3. **Access the Application:**
   Open your browser and navigate to:
   **[http://localhost:5173](http://localhost:5173)**

## Using the "God Mode" Testing Dashboard

The React frontend serves as a "God Mode" dashboard to visually prove the state machine, ledger math, and locking mechanisms.

### Default Credentials
To simplify the POC, the backend automatically seeds a default wallet and mocks the user session headers.
- **Default Starting Balance:** 10,000,000.00
- **Vault PIN:** `123456`

### Dashboard Panels
1. **Ledger Status:** Displays the real-time math of the wallet. `Total Balance` minus `Locked in Vault` always equals the `Available (Liquid)` balance.
2. **Lock Funds:** Allows you to simulate creating a digital contract. You specify a Payee, an Amount, and must provide the correct `123456` Vault PIN.
3. **Contracts Ledger:** A table showing all existing purpose-bound contracts. You can click **Execute** (permanently transferring funds) or **Revoke** (unlocking funds back to the available pool). Both actions require a secure modal prompt for the Vault PIN.

### Brute Force Protection
The backend tracks failed PIN attempts. If you enter an incorrect Vault PIN 5 times in a row, the wallet will be temporarily locked for 15 minutes, rejecting all further attempts.