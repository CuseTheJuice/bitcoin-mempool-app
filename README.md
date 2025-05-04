# Bitcoin Mempool App

A Next.js application for real-time inspection of the Bitcoin mempool, displaying transaction details and mempool statistics. Built with Tailwind CSS and DaisyUI for a responsive and modern UI.

## Features

- **Real-Time Mempool Data**: Displays mempool statistics including transaction count, total fees, and mempool size (in MB), updated every 30 seconds.
- **Transaction Search**: Search for specific Bitcoin transactions by TXID, with detailed views in a popup window.
- **Transaction History**: Tracks recent mempool transactions and manual searches, with sorting and filtering by status (pending/confirmed) and source (e.g., Local Bitcoin Node, Mempool.space).
- **Detailed Transaction Insights**: Includes fee, size, fee rate (sat/vB), status, confirmations, wallet type, witness data, inputs/outputs, and OP_RETURN data.
- **Error Handling**: Robust error handling with user-friendly messages, status codes, and source information using React ErrorBoundary.
- **Persistent History**: Stores transaction history in `localStorage` for persistence across sessions, with an option to clear history.
- **Interactive UI**: Features refresh buttons, loading states, and a popup window for transaction details with refresh and close options.
- **Responsive Design**: Styled with Tailwind CSS and DaisyUI for a clean, accessible, and mobile-friendly interface.

## Tech Stack

- **Framework**: Next.js (React)
- **State Management**: React Hooks (`useState`, `useEffect`)
- **Styling**: Tailwind CSS, DaisyUI
- **Error Handling**: React ErrorBoundary
- **Data Fetching**: Fetch API for interacting with Bitcoin node or Mempool.space API
- **Storage**: `localStorage` for transaction history
- **Type Safety**: TypeScript with interfaces for mempool stats, transaction data, and error states

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/CuseTheJuice/bitcoin-mempool-app.git
   cd bitcoin-mempool-app

2. **Setup your Local Enviroment**:

   Create a .env.local file in the root directory to configure the Bitcoin node or Mempool.space API endpoint and authentication credentials. Example configuration:

   (example)

   # URL of the Bitcoin node or Mempool.space API
   BITCOIN_NODE_URL=http://localhost:8332

   # Basic auth credentials for the Bitcoin node (format: username:password)
   BITCOIN_NODE_AUTH=your-username:your-password

   Adjust to your local Bitcoin Node.  Refrer to your local bitcoin.conf

3. **Run**:

npm run dev   

sudo ./start.sh allows your local npm to listen on https port 443
Adjust the npm path in start.sh to match your env, otherwise npm will listen port 3000