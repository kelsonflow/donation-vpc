require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

// CORS Configuration
const allowedOrigins = [
  'https://donation-jpc.com',
  'https://www.donation-jpc.com',
  'http://localhost:3000'  // Keep this for local development
];

app.use(cors({
  origin: function(origin, callback) {
    if(!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || origin === allowedOrigin + '/'
    );
    if(isAllowed){
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Routes
app.post('/create-payment-intent', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 200, // Amount in cents (2 euros)
      currency: 'eur',
      metadata: { product: 'ebook' },
      // Include a success URL in the metadata
      metadata: { 
        product: 'ebook',
        success_url: `${req.protocol}://${req.get('host')}/download-ebook`
      }
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('Error creating PaymentIntent:', err);
    res.status(500).json({ error: 'An error occurred while processing your payment.' });
  }
});

app.get('/download-ebook', async (req, res) => {
  const paymentIntentId = req.query.payment_intent;

  if (!paymentIntentId) {
    return res.status(400).send('Payment Intent ID is required');
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(403).send('Payment not completed');
    }

    const filePath = path.join(__dirname, 'ebooks', 'um-presente.pdf');
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('eBook not found');
    }

    res.download(filePath, 'your-ebook.pdf', (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).send('Error downloading file');
      }
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).send('Error verifying payment');
  }
});

app.get('/', (req, res) => {
  res.send('Donation API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));