import PlansPage from './plans-page';
export const metadata={title:'Planes · Nexo',description:'Compara las propuestas Esencial, Profesional y Empresa de Nexo: desde $19.990 CLP al mes.'};
export default async function Page({searchParams}: {searchParams: Promise<{demo?: string | string[]}>}) { return <PlansPage initialDemoOpen={(await searchParams).demo === '1'}/>; }
