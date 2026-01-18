# Authentication System Documentation

## Overview

DermaHMS uses a custom JWT-based authentication system with email OTP verification.

## Flow

### 1. Signup Flow

```
User → /api/auth/signup → Email with OTP → /api/auth/verify-otp → JWT Token
```

#### Step 1: User Signup
**Endpoint**: `POST /api/auth/signup`

**Request Body**:
```json
{
  "email": "doctor@example.com",
  "password": "securePassword123",
  "name": "Dr. John Doe",
  "tier": "tier2",
  "phone": "+91 9876543210",
  "clinicName": "Skin Care Clinic" // Required for tier2
}
```

**Response** (201):
```json
{
  "success": true,
  "message": "Signup successful! Please check your email for OTP verification.",
  "data": {
    "userId": "64f1a2b3c4d5e6f7g8h9i0j1",
    "email": "doctor@example.com"
  }
}
```

#### Step 2: Verify OTP
**Endpoint**: `POST /api/auth/verify-otp`

**Request Body**:
```json
{
  "email": "doctor@example.com",
  "otp": "123456",
  "clinicData": { // Required for tier2
    "clinicName": "Skin Care Clinic",
    "address": "123 Medical Street",
    "phone": "+91 9876543210"
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Email verified successfully!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "email": "doctor@example.com",
      "name": "Dr. John Doe",
      "tier": "tier2",
      "clinicId": "64f1a2b3c4d5e6f7g8h9i0j2"
    }
  }
}
```

### 2. Login Flow

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "email": "doctor@example.com",
  "password": "securePassword123"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Login successful!",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "email": "doctor@example.com",
      "name": "Dr. John Doe",
      "tier": "tier2",
      "clinicId": "64f1a2b3c4d5e6f7g8h9i0j2",
      "phone": "+91 9876543210"
    }
  }
}
```

### 3. Get Current User

**Endpoint**: `GET /api/auth/me`

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "email": "doctor@example.com",
      "name": "Dr. John Doe",
      "tier": "tier2",
      "phone": "+91 9876543210",
      "clinicId": "64f1a2b3c4d5e6f7g8h9i0j2",
      "isVerified": true,
      "createdAt": "2025-01-02T10:00:00.000Z"
    }
  }
}
```

## Using Auth Middleware

### Basic Authentication

```typescript
import { authMiddleware } from "@/lib/auth/middleware";

export async function GET(request: NextRequest) {
  const authResult = await authMiddleware(request);

  if (authResult instanceof NextResponse) {
    return authResult; // Authentication failed
  }

  const { user } = authResult;
  // user contains: userId, email, tier, clinicId

  // Your protected logic here
}
```

### Require Specific Tier

```typescript
import { requireTier } from "@/lib/auth/middleware";

export async function POST(request: NextRequest) {
  const authResult = await requireTier(request, "tier2");

  if (authResult instanceof NextResponse) {
    return authResult; // Not tier2 or not authenticated
  }

  const { user } = authResult;
  // Only tier2 users can access this
}
```

### Require Clinic Access

```typescript
import { requireClinic } from "@/lib/auth/middleware";

export async function POST(request: NextRequest) {
  const authResult = await requireClinic(request);

  if (authResult instanceof NextResponse) {
    return authResult; // Not a clinic or not authenticated
  }

  const { user } = authResult;
  // user.clinicId is guaranteed to exist
}
```

## Environment Variables

Add these to `.env.local`:

```env
# JWT
JWT_SECRET=your-super-secret-key-change-in-production

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@dermahms.com

# App URL (for email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Gmail Setup for Email

1. Enable 2-Factor Authentication on your Gmail account
2. Go to Google Account → Security → App Passwords
3. Generate an app password for "Mail"
4. Use that password in `EMAIL_PASSWORD`

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [...]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "This endpoint requires tier2 access"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "User with this email already exists"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Security Features

1. **Password Hashing**: bcryptjs with 10 salt rounds
2. **JWT Expiry**: 7 days
3. **OTP Expiry**: 10 minutes
4. **Email Verification**: Required before login
5. **Token-based Authentication**: Stateless JWT tokens

## Testing with cURL

### Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "tier": "tier1"
  }'
```

### Verify OTP
```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Next Steps

- Implement password reset functionality
- Add refresh tokens for extended sessions
- Implement rate limiting for OTP requests
- Add account deactivation/deletion
