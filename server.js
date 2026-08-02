const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Helper to check if session state exists
function hasSessionState() {
  return fs.existsSync('state.json');
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    sessionAvailable: hasSessionState(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Bela Bharat Gas Nexus V1 backend running on port ${PORT}`);
  if (!hasSessionState()) {
    console.warn('WARNING: state.json not found! Run "node setup-session.js" to authenticate.');
  }
});