export type SavedAddress={recipient:string;phone:string;line1:string;commune:string;region:string;country:'CL';postalCode?:string};
export type AddressEntry={id:string;label:string;address:SavedAddress;isDefault:boolean};
export type CustomerProfile={addresses:AddressEntry[];name:string;email:string;phone:string;defaultAddress:SavedAddress|null;paymentPreference:'CARD'|'TRANSFER'|null};
export type TestCard={id:string;label:string;brand:string;prefix?:string;last_four:string;holder?:string|null;expiry_month?:number;expiry_year?:number;funding_type?:'CREDIT'|'DEBIT';is_default?:boolean;details_available?:boolean};
export type ShippingRate={id:string;city:string;region:string;fee_minor:string;active?:boolean;delivery_days_min?:number|null;delivery_days_max?:number|null};
export type ShippingEstimate={rateId:string;city:string;region:string;goodsMinor:string;shippingMinor:string;totalMinor:string;deliveryDaysMin?:number|null;deliveryDaysMax?:number|null};

export type CardDetails={brand:string;lastFour:string;holder:string|null;expiryMonth:number|null;expiryYear:number|null;expiresAt:string};
