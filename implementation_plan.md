# Plan de Implementación: Flujo de Dispositivo y Unidad Virtual (Windows Shell)

Para resolver los problemas de autenticación y hacer que la unidad virtual aparezca realmente en Windows, necesitamos hacer tres cambios principales:

## ⚠️ User Review Required

> [!WARNING]
> **1. Integración en el Panel de Navegación de Windows (Explorador):**
> La API `CfRegisterSyncRoot` le dice a Windows cómo manejar los archivos bajo demanda, pero **no** ancla el ícono en la barra lateral izquierda del explorador de archivos. Para que aparezca igual que OneDrive, necesitamos inyectar claves en el Registro de Windows (`regedit`). 
> - Crearé un método en C# que inyecte automáticamente las subclaves necesarias en `HKCU\Software\Classes\CLSID` para registrar "Cloud Shakes" en el Shell de Windows. ¿Estás de acuerdo con modificar el registro de usuario local?

> [!IMPORTANT]
> **2. Flujo de Autenticación (Device Flow):**
> Actualmente `/device/verify` es una página estática en el backend sin contexto de usuario. 
> - **Solución:** Moveremos la página de confirmación al **Frontend (Next.js)** (ej. `/dashboard/device-auth`). Al abrir el cliente, te enviará a esa URL en Next.js. El frontend usará la sesión de tu cuenta iniciada y enviará el JWT al backend (`/api/auth/device/confirm`) silenciosamente, completando el inicio de sesión.

## Proposed Changes

### 1. Backend (`backend/src/routes/auth.ts`)
- [MODIFY] Eliminar la página HTML estática servida en `GET /device/verify`.
- [MODIFY] Cambiar la ruta `POST /device/confirm` para que acepte solicitudes JSON estándar provenientes del frontend, extrayendo el `userId` desde el middleware `protect`.

### 2. Frontend (`frontend/src/app/dashboard/device-auth/page.tsx`)
- [NEW] Crear una nueva página en el panel de control de Next.js.
- Cuando el usuario visite esta página con el parámetro `?code=XYZ`, la página leerá el código, validará la sesión del usuario y mostrará un botón de "Autorizar Dispositivo".
- Al pulsar, hará un `POST` usando el cliente `fetch` configurado con cookies/tokens al backend.

### 3. Cliente C# (`cloud-shakes-vfs`)
- [MODIFY] `MainWindow.xaml`: Añadir etiquetas y *ProgressBars* para mostrar en tiempo real si está "Esperando al navegador...", "Autorizado", etc.
- [MODIFY] `AuthService.cs`: Actualizar la URL de verificación para que apunte al Frontend en lugar del Backend.
- [NEW] `VirtualDrive/ShellIntegration.cs`: Código C# para escribir los CLSID en el registro (`Registry.CurrentUser`) que anclarán "Cloud Shakes" en el Explorador de Windows y le asignarán un ícono.

## Verification Plan
1. Ejecutar la app C#. Se abrirá el navegador en el frontend de Next.js (`http://localhost:9090/...`).
2. La app C# mostrará "Esperando autorización..." en tiempo real.
3. Al aceptar en Next.js, la app C# detectará el token, actualizará la UI a "¡Éxito!" y procederá a inyectar el Registro.
4. Abriremos el Explorador de Windows y verificaremos que "Cloud Shakes" aparece en el panel izquierdo como una unidad en la nube.
