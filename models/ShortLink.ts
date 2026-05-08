import mongoose, { Schema, Document, Model } from "mongoose";

export interface IShortLink extends Document {
  code: string;
  url: string;
  clinicId?: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const ShortLinkSchema = new Schema<IShortLink>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ShortLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ShortLink: Model<IShortLink> =
  mongoose.models.ShortLink || mongoose.model<IShortLink>("ShortLink", ShortLinkSchema);

export default ShortLink;
