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
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Routes
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Stripe expects the amount in cents
      currency: 'eur',
      metadata: { 
        product: 'ebook'
      }
    });

    console.log(`Payment Intent created: ${paymentIntent.id} for amount: ${amount} cents`);
    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('Error creating PaymentIntent:', err);
    res.status(500).json({ error: 'An error occurred while processing your payment.' });
  }
});

app.post('/confirm-payment', async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ error: 'Payment Intent ID is required' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      console.log(`Payment confirmed for: ${paymentIntentId}`);
      res.json({ success: true, downloadUrl: `/download-ebook?payment_intent=${paymentIntentId}` });
    } else {
      console.warn(`Payment not successful for: ${paymentIntentId}`);
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (err) {
    console.error('Error confirming payment:', err);
    res.status(500).json({ error: 'An error occurred while confirming your payment.' });
  }
});

app.get('/download-ebook', async (req, res) => {
  const paymentIntentId = req.query.payment_intent;

  if (!paymentIntentId) {
    console.warn('Download attempt without Payment Intent ID');
    return res.status(400).send('Payment Intent ID is required');
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      console.warn(`Download attempt for unsuccessful payment: ${paymentIntentId}`);
      return res.status(403).send('Payment not completed');
    }

    const filePath = path.join(__dirname, 'ebooks', 'um-presente.pdf');
    
    if (!fs.existsSync(filePath)) {
      console.error(`eBook file not found: ${filePath}`);
      return res.status(404).send('eBook not found');
    }

    res.download(filePath, 'Um-Presente.pdf', (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).send('Error downloading file');
      } else {
        console.log(`eBook downloaded for payment: ${paymentIntentId}`);
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
  console.error('Unhandled error:', err);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));