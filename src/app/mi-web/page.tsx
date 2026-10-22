import {redirect} from 'next/navigation';
import {pageSession} from '../../server/page-session';
import {database} from '../../server/db';

export default async function CompanyWebsite(){
 const user=await pageSession();
 if(!user)redirect('/panel');
 const company=(await database().query('SELECT slug FROM companies WHERE id=$1',[user.company_id])).rows[0];
 if(!company)redirect('/panel');
 redirect(`/tienda?empresa=${encodeURIComponent(company.slug)}`);
}
