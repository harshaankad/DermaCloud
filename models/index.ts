// Central export for all models
export { default as User } from "./User";
export type { IUser } from "./User";

export { default as Clinic } from "./Clinic";
export type { IClinic, ICustomField, IFieldSettings, ISectionSettings } from "./Clinic";

export { default as Patient } from "./Patient";
export type { IPatient } from "./Patient";

export { default as ConsultationDermatology } from "./ConsultationDermatology";
export type {
  IConsultationDermatology,
  IAIResult,
  IConsultationImage,
  IMedication,
} from "./ConsultationDermatology";

export { default as ConsultationCosmetology } from "./ConsultationCosmetology";
export type {
  IConsultationCosmetology,
  ICosmetologyImage,
} from "./ConsultationCosmetology";

export { default as TemplateDermatology } from "./TemplateDermatology";
export type { ITemplateDermatology } from "./TemplateDermatology";

export { default as TemplateCosmetology } from "./TemplateCosmetology";
export type { ITemplateCosmetology } from "./TemplateCosmetology";

export { default as OTP } from "./OTP";
export type { IOTP } from "./OTP";

// Frontdesk Add-on Kit Models
export { default as FrontdeskStaff } from "./FrontdeskStaff";
export type { IFrontdeskStaff } from "./FrontdeskStaff";

export { default as Appointment } from "./Appointment";
export type { IAppointment } from "./Appointment";

export { default as InventoryItem } from "./InventoryItem";
export type { IInventoryItem } from "./InventoryItem";

export { default as InventoryTransaction } from "./InventoryTransaction";
export type { IInventoryTransaction } from "./InventoryTransaction";

export { default as Sale } from "./Sale";
export type { ISale, ISaleItem, IGstBreakdown as ISaleGstBreakdown } from "./Sale";

export { default as Purchase } from "./Purchase";
export type { IPurchase, IPurchaseItem, IGstBreakdown } from "./Purchase";

export { default as PurchaseReturn } from "./PurchaseReturn";
export type { IPurchaseReturn, IPurchaseReturnItem } from "./PurchaseReturn";

export { default as SalesReturn } from "./SalesReturn";
export type { ISalesReturn, ISalesReturnItem } from "./SalesReturn";
