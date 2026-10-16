import {z} from 'zod';
export const attributeSchema=z.object({
 key:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),label:z.string().trim().min(1).max(100),
 type:z.enum(['text','number','select','boolean']),unit:z.string().max(20).optional(),
 options:z.array(z.object({value:z.string().min(1).max(100),label:z.string().min(1).max(100)}).strict()).max(50).optional(),
 suggestions:z.array(z.number().finite()).max(30).optional(),min:z.number().finite().optional(),max:z.number().finite().optional()
}).strict().superRefine((v,ctx)=>{
 if(v.type==='select'&&(!v.options?.length||new Set(v.options.map(o=>o.value)).size!==v.options.length))ctx.addIssue({code:'custom',message:'Opciones únicas requeridas'});
 if(v.type!=='select'&&v.options)ctx.addIssue({code:'custom',message:'Solo las listas usan opciones'});
 if(v.type!=='number'&&(v.min!==undefined||v.max!==undefined||v.suggestions))ctx.addIssue({code:'custom',message:'Solo los números usan límites'});
 if(v.min!==undefined&&v.max!==undefined&&v.min>v.max)ctx.addIssue({code:'custom',message:'Rango inválido'});
});
export const attributesSchema=z.array(attributeSchema).max(40).refine(v=>new Set(v.map(a=>a.key)).size===v.length,'Claves repetidas');
export type Attribute=z.infer<typeof attributeSchema>;
export type Specifications=Record<string,string|number|boolean>;
export type Category={id:string;parent_id:string|null;name:string;slug:string;attributes:Attribute[];fields:Attribute[];path:string;depth:number};
const number=(key:string,label:string,unit:string,suggestions:number[],max=1000000):Attribute=>({key,label,type:'number',unit,min:0.01,max,suggestions});
const select=(key:string,label:string,values:string[]):Attribute=>({key,label,type:'select',options:values.map(value=>({value,label:value}))});
const capacity=number('capacity_gb','Capacidad','GB',[128,256,512,1000,2000,4000]);
const monitor:Attribute[]=[number('screen_inches','Tamaño','pulgadas',[21.5,23.8,24,27,32,34],100),select('resolution','Resolución',['1920x1080','2560x1440','3440x1440','3840x2160']),number('refresh_hz','Frecuencia de actualización','Hz',[60,75,100,120,144,165,180,240,360],1000),select('panel','Panel',['IPS','VA','TN','OLED']),{key:'curved',label:'Pantalla curva',type:'boolean'}];
monitor[1].options=[{value:'1920x1080',label:'Full HD · 1920 × 1080'},{value:'2560x1440',label:'QHD (1440p) · 2560 × 1440'},{value:'3440x1440',label:'UWQHD · 3440 × 1440'},{value:'3840x2160',label:'4K UHD · 3840 × 2160'}];
const connection=select('connection','Conexión',['USB','Bluetooth','Receptor inalámbrico','USB / Bluetooth / Receptor']);
export type CategoryTemplate={slug:string;name:string;parent?:string;attributes:Attribute[]};
export const technologyCategories:CategoryTemplate[]=[
 {slug:'componentes',name:'Componentes',attributes:[]},
 {slug:'almacenamiento',name:'Almacenamiento',parent:'componentes',attributes:[capacity]},
 {slug:'ssd',name:'SSD',parent:'almacenamiento',attributes:[select('interface','Interfaz',['SATA III','PCIe 3.0 NVMe','PCIe 4.0 NVMe','PCIe 5.0 NVMe']),select('form_factor','Formato',['2.5 pulgadas','M.2 2280','M.2 2230']),{key:'dram',label:'Memoria DRAM',type:'boolean'}]},
 {slug:'hdd',name:'Discos duros HDD',parent:'almacenamiento',attributes:[number('rpm','Velocidad de giro','RPM',[5400,7200],20000),select('form_factor','Formato',['2.5 pulgadas','3.5 pulgadas'])]},
 {slug:'memorias-ram',name:'Memorias RAM',parent:'componentes',attributes:[number('capacity_gb','Capacidad','GB',[4,8,16,32,64,128],1024),select('memory_type','Tecnología',['DDR4','DDR5']),number('speed_mts','Velocidad','MT/s',[2666,3200,4800,5200,5600,6000],20000),select('form_factor','Formato',['DIMM','SO-DIMM'])]},
 {slug:'procesadores',name:'Procesadores',parent:'componentes',attributes:[{key:'socket',label:'Socket',type:'text'},number('cores','Núcleos','',[4,6,8,12,16],512),{key:'integrated_graphics',label:'Gráficos integrados',type:'boolean'}]},
 {slug:'placas-madre',name:'Placas madre',parent:'componentes',attributes:[{key:'socket',label:'Socket',type:'text'},{key:'chipset',label:'Chipset',type:'text'},select('form_factor','Formato',['ATX','Micro ATX','Mini ITX']),select('memory_type','Memoria compatible',['DDR4','DDR5'])]},
 {slug:'tarjetas-graficas',name:'Tarjetas gráficas',parent:'componentes',attributes:[number('vram_gb','Memoria de video','GB',[4,6,8,12,16,24],128),{key:'gpu',label:'GPU',type:'text'}]},
 {slug:'fuentes',name:'Fuentes de poder',parent:'componentes',attributes:[number('power_w','Potencia','W',[450,550,650,750,850,1000],3000),select('certification','Certificación',['Sin certificación','80 PLUS','80 PLUS Bronze','80 PLUS Gold','80 PLUS Platinum','80 PLUS Titanium']),{key:'modular',label:'Modular',type:'boolean'}]},
 {slug:'gabinetes',name:'Gabinetes',parent:'componentes',attributes:[select('form_factor','Placa madre compatible',['ATX','Micro ATX','Mini ITX'])]},
 {slug:'refrigeracion',name:'Refrigeración',parent:'componentes',attributes:[select('cooling_type','Tipo',['Aire','Líquida']),number('fan_mm','Ventilador','mm',[92,120,140],400)]},
 {slug:'monitores',name:'Monitores',attributes:monitor},
 {slug:'monitores-escritorio',name:'Monitores de escritorio',parent:'monitores',attributes:[]},
 {slug:'monitores-portatiles',name:'Monitores portátiles',parent:'monitores',attributes:[]},
 {slug:'accesorios',name:'Accesorios y periféricos',attributes:[]},
 {slug:'teclados',name:'Teclados',parent:'accesorios',attributes:[connection,select('keyboard_type','Mecanismo',['Membrana','Mecánico','Tijera']),select('layout','Distribución',['Español','Español Latinoamérica','Inglés'])]},
 {slug:'mouse',name:'Mouse',parent:'accesorios',attributes:[connection,number('dpi','Resolución del sensor','DPI',[1000,1600,4000,8000,16000,25600],100000)]},
 {slug:'audifonos',name:'Audífonos',parent:'accesorios',attributes:[connection,{key:'microphone',label:'Micrófono',type:'boolean'}]},
 {slug:'webcams',name:'Cámaras web',parent:'accesorios',attributes:[select('resolution','Resolución',['1280x720','1920x1080','3840x2160']),number('fps','Cuadros por segundo','fps',[30,60],240)]},
 {slug:'mousepads',name:'Mousepads',parent:'accesorios',attributes:[number('width_mm','Ancho','mm',[250,450,900],2000)]},
 {slug:'cables',name:'Cables',parent:'accesorios',attributes:[{key:'connector',label:'Conectores',type:'text'},number('length_m','Largo','m',[1,1.5,2,3,5,10],100)]},
 {slug:'hubs',name:'Hubs y adaptadores',parent:'accesorios',attributes:[{key:'connector',label:'Conector de entrada',type:'text'},number('ports','Puertos','',[2,4,7,8],64)]},
 {slug:'redes',name:'Redes',attributes:[]},
 {slug:'routers',name:'Routers',parent:'redes',attributes:[select('wifi_standard','Wi-Fi',['Wi-Fi 4','Wi-Fi 5','Wi-Fi 6','Wi-Fi 6E','Wi-Fi 7']),number('lan_ports','Puertos LAN','',[2,3,4,8],64)]},
 {slug:'switches',name:'Switches',parent:'redes',attributes:[number('ports','Puertos','',[5,8,16,24,48],128),number('speed_mbps','Velocidad por puerto','Mbps',[100,1000,2500,10000],100000),{key:'poe',label:'PoE',type:'boolean'}]},
 {slug:'adaptadores-wifi',name:'Adaptadores Wi-Fi',parent:'redes',attributes:[select('wifi_standard','Wi-Fi',['Wi-Fi 4','Wi-Fi 5','Wi-Fi 6','Wi-Fi 6E','Wi-Fi 7']),select('interface','Interfaz',['USB','PCIe'])]},
 {slug:'computadores',name:'Computadores',attributes:[]},
 {slug:'notebooks',name:'Notebooks',parent:'computadores',attributes:[{key:'processor',label:'Procesador',type:'text'},number('ram_gb','Memoria RAM','GB',[8,16,32,64],512),capacity,number('screen_inches','Tamaño','pulgadas',[13.3,14,15.6,16,17.3],30)]},
 {slug:'pc-escritorio',name:'PC de escritorio',parent:'computadores',attributes:[{key:'processor',label:'Procesador',type:'text'},number('ram_gb','Memoria RAM','GB',[8,16,32,64],512),capacity]}
];
export const commonAttributes:Attribute[]=[{key:'brand',label:'Marca',type:'text'},{key:'model',label:'Modelo / número de parte',type:'text'}];
export function categoryTree(rows:Omit<Category,'fields'|'path'|'depth'>[]):Category[]{
 const map=new Map(rows.map(r=>[r.id,r]));
 return rows.map(row=>{
  const chain=[row];let parent=row.parent_id;
  while(parent){const item=map.get(parent);if(!item||chain.some(c=>c.id===item.id)||chain.length>=6)throw new Error('Árbol de categorías inválido');chain.unshift(item);parent=item.parent_id;}
  const fields=new Map(commonAttributes.map(a=>[a.key,a]));for(const node of chain)for(const field of node.attributes)fields.set(field.key,field);
  return {...row,fields:[...fields.values()],path:chain.map(c=>c.name).join(' / '),depth:chain.length-1};
 }).sort((a,b)=>a.path.localeCompare(b.path,'es'));
}
export function specificationLabel(field:Attribute,value:string|number|boolean):string{
 if(typeof value==='boolean')return value?'Sí':'No';
 if(field.options)return field.options.find(o=>o.value===value)?.label??String(value);
 if(field.key==='capacity_gb'&&typeof value==='number'&&value>=1000&&value%1000===0)return `${value/1000} TB`;
 return `${value}${field.unit?' '+field.unit:''}`;
}
