# iZZ Full-Stack Store

This turns the original iZZ static frontend into a MongoDB-backed ecommerce app with:

- customer accounts and login
- product catalog from MongoDB
- shopping cart
- checkout and order creation
- order tracking
- inventory stock deductions
- admin panel for products, prices, images, descriptions, inventory, orders, tracking, and social links
- payment gateway placeholders for bKash, Nagad, and Upay

## Requirements

- Node.js 18+
- MongoDB running locally or a MongoDB Atlas connection string

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set `JWT_SECRET`.

3. Start MongoDB, then seed sample products:

```bash
npm run seed
```

4. Start the site:

```bash
npm start
```

Open:

- Storefront: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin.html`

## Admin Account

The first user who signs up becomes the admin automatically. Use the admin page's "First Signup" button to create that first admin account.

## Payment Gateways

The app has a payment initiation endpoint for `bkash`, `nagad`, and `upay`, but live payment execution is intentionally left behind environment variables. Each provider requires official merchant onboarding, credentials, sandbox/live URLs, callback URLs, and signature/token rules.

Until those credentials are added, checkout creates a sandbox-style payment reference and then places the order.

## Main API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/products`
- `POST /api/products` admin
- `PUT /api/products/:id` admin
- `GET /api/cart`
- `POST /api/cart/items`
- `POST /api/orders`
- `GET /api/orders`
- `PUT /api/orders/:id` admin
- `GET /api/settings`
- `PUT /api/settings` admin
