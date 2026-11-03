/** Proposed launch pricing; presentation data, not active billing or quota rules. */
export const plans=[
 {id:'esencial',name:'Esencial',price:19990,description:'Para partir con un local y llevar tus productos a la web.',branches:1,agents:2,products:1000,fit:'Un local, un equipo pequeño.',featured:false},
 {id:'profesional',name:'Profesional',price:39990,description:'Para coordinar varias sucursales y un equipo en crecimiento.',branches:3,agents:8,products:5000,fit:'Más sucursales, el mismo control.',featured:true},
 {id:'empresa',name:'Empresa',price:69990,description:'Para una operación más amplia, con más ubicaciones y personas.',branches:8,agents:20,products:15000,fit:'Tu operación, a mayor escala.',featured:false},
] as const;
export type PlanId=typeof plans[number]['id'];
export const clp=(value:number)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
export const count=(value:number)=>new Intl.NumberFormat('es-CL').format(value);
