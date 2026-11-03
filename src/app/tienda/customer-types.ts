export type SavedAddress={recipient:string;phone:string;line1:string;commune:string;region:string;country:'CL';postalCode?:string};
export type CustomerProfile={name:string;email:string;phone:string;defaultAddress:SavedAddress|null;paymentPreference:'CARD'|'TRANSFER'|null};
export type TestCard={id:string;label:string;brand:string;prefix:string;last_four:string};
export type ShippingRate={id:string;city:string;region:string;fee_minor:string;active?:boolean};
export type ShippingEstimate={rateId:string;city:string;region:string;goodsMinor:string;shippingMinor:string;totalMinor:string};
