# DermaHMS - Dermatology Hospital Management System

AI-powered dermatology diagnosis and clinic workflow management SaaS for private clinics in India.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB (Mongoose)
- **Storage**: AWS S3
- **Payment**: Razorpay
- **AI**: ONNX Runtime (CPU optimized)
- **Auth**: Custom JWT

## Project Structure

```
derma-hms/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── signup/
│   │   └── forgot-password/
│   ├── dashboard/
│   ├── tier1/              # AI-only plan pages
│   ├── tier2/              # Clinic workflow pages
│   ├── api/
│   │   ├── auth/
│   │   ├── upload/
│   │   ├── inference/
│   │   ├── patients/
│   │   ├── visits/
│   │   ├── reports/
│   │   └── payment/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/                 # Reusable UI components
│   ├── layout/             # Layout components
│   ├── forms/              # Form components
│   └── charts/             # Chart components
├── lib/
│   ├── db/                 # MongoDB connection & utilities
│   ├── aws/                # AWS S3 utilities
│   ├── ai/                 # AI inference utilities
│   └── utils/              # General utilities
├── models/                 # Mongoose schemas
├── types/                  # TypeScript type definitions
├── middleware/             # Next.js middleware
├── hooks/                  # Custom React hooks
└── public/
    ├── images/
    └── fonts/
```

## Features

### Tier 1 (AI-Only Plan)
- Upload dermoscopy images
- AI inference for diagnosis
- Top predictions with probabilities
- Download results as Word/PDF
- Usage limits: 5 scans/day, 100-120 scans/month

### Tier 2 (Clinic Workflow + AI)
- Patient profile management
- Visit records with custom fields
- Clinical & dermoscopy image uploads
- AI inference attached to visits
- Medical report generation
- Before/after image comparison
- Customizable form fields
- Prescription templates

## Environment Variables

Copy `.env.local` and fill in your credentials:

```env
MONGODB_URI=
JWT_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET_NAME=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env.local`

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Build for Production

```bash
npm run build
npm start
```

## Deployment

Deploy to Vercel:
```bash
vercel
```

## License

Proprietary - All rights reserved
