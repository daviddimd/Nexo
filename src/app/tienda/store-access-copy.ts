import type {AccessMode} from '../../catalog/store-access-paths';
export const accessCopy:Record<AccessMode,{title:string;description:string;action:string}>={
 login:{title:'Iniciar sesión',description:'Entra para continuar con tu compra y consultar tus pedidos.',action:'Entrar a mi cuenta'},
 register:{title:'Crear cuenta',description:'Guarda tus datos de entrega y encuentra todas tus compras en un solo lugar.',action:'Crear mi cuenta'},
 forgot:{title:'Recuperar contraseña',description:'Ingresa tu correo para solicitar un código de recuperación.',action:'Enviar instrucciones'},
 resend:{title:'Verificar correo',description:'Solicita un nuevo código para activar tu cuenta.',action:'Enviar código'},
 verify:{title:'Verificar tu cuenta',description:'Ingresa el código de verificación para continuar.',action:'Verificar correo'},
 reset:{title:'Nueva contraseña',description:'Ingresa el código de recuperación y elige una nueva contraseña.',action:'Guardar contraseña'}
};
