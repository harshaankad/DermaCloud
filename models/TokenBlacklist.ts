import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITokenBlacklist extends Document {
  jti: string;       // JWT ID to blacklist
  expiresAt: Date;   // when the original token would have expired
  createdAt: Date;
}

const TokenBlacklistSchema = new Schema<ITokenBlacklist>(
  {
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Auto-delete blacklist entries once the original token would have expired anyway
TokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TokenBlacklist: Model<ITokenBlacklist> =
  mongoose.models.TokenBlacklist ||
  mongoose.model<ITokenBlacklist>("TokenBlacklist", TokenBlacklistSchema);

export default TokenBlacklist;
