# ☁️ Cloud Shakes – Plataforma de Gestión en la Nube Open Source

Cloud Shakes es una solución moderna y escalable para almacenamiento, gestión y compartición de archivos, diseñada para ofrecer una experiencia fluida, segura y altamente personalizable.

🌐 **Sitio Web:** [shakes.es](https://shakes.es)  
📚 **Documentación:** [docs.shakes.es](https://docs.shakes.es)

##  Características

- **Almacenamiento en la nube** con interfaz intuitiva
- **Gestión de archivos y carpetas** con drag & drop
- **Vista previa de archivos** integrada
- **Sistema de enlaces compartidos** seguro
- **Interfaz responsive** para todos los dispositivos
- **Subida progresiva** con indicadores visuales
- **Búsqueda avanzada** de archivos
- **Gestión de documentos** y notas
- **Calendario integrado**
- **Estadísticas de uso**
- **Seguridad mejorada** con validación y auditoría

## Stack Tecnológico

### Frontend
- **Next.js 15** con App Router
- **TypeScript** para tipado seguro
- **Tailwind CSS** para estilos modernos
- **Framer Motion** para animaciones fluidas
- **Lucide React** para iconos
- **Axios** para peticiones HTTP

### Backend
- **Node.js** con Express 4
- **TypeScript**
- **Prisma** como ORM
- **PostgreSQL** como base de datos
- **JWT** para autenticación
- **Multer** para manejo de archivos
- **Helmet** para seguridad
- **Rate Limiting** para protección

## 📦 Instalación

### Prerrequisitos
- Node.js 18+
- PostgreSQL 13+
- npm o yarn

### Configuración del Backend

1. Clona el repositorio:
```bash
git clone https://github.com/CloudShakes/cloud-shakes.git
cd cloud-shakes
```

2. Configura las variables de entorno:
```bash
cd backend
cp .env.example .env
# Edita .env con tus credenciales
```

3. Instala dependencias y ejecuta migraciones:
```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

### Configuración del Frontend

1. En una nueva terminal:
```bash
cd frontend
cp .env.example .env.local
# Edita .env.local con la URL del backend
```

2. Instala dependencias y ejecuta:
```bash
npm install
npm run dev
```

## �️ Estructura del Proyecto

```
cloud-shakes/
├── frontend/          # Aplicación Next.js
│   ├── src/
│   │   ├── app/      # Páginas y layouts
│   │   ├── components/ # Componentes reutilizables
│   │   ├── context/   # Contextos de React
│   │   ├── hooks/     # Hooks personalizados
│   │   └── lib/       # Utilidades y configuración
│   └── public/       # Archivos estáticos
├── backend/           # API REST con Express
│   ├── src/
│   │   ├── routes/    # Endpoints de la API
│   │   ├── middleware/ # Middleware de autenticación y seguridad
│   │   ├── utils/     # Utilidades del servidor
│   │   ├── types/     # Tipos TypeScript
│   │   └── config/    # Configuración de la base de datos
│   └── prisma/        # Schema y migraciones
├── Aplicaciones/      # Aplicaciones de escritorio
│   ├── cloud-talks-desktop/
│   └── desktop-sync/
└── assets/           # Imágenes y recursos
```

## � Variables de Entorno

### Backend (.env)
```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/cloud_shakes"

# JWT
JWT_SECRET="tu-secreto-jwt-muy-seguro"
JWT_EXPIRES_IN="7d"

# Archivos
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE="100MB"

# Servidor
PORT=5000
NODE_ENV="production"

# CORS
ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"

# Seguridad
BCRYPT_ROUNDS="12"
CSRF_SECRET="tu-secreto-csrf"
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
NEXT_PUBLIC_APP_NAME="Cloud Shakes"
```

## � API Endpoints

### Autenticación
- `POST /api/auth/register` - Registro de usuarios
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/logout` - Cierre de sesión

### Archivos
- `GET /api/files` - Listar archivos
- `POST /api/files` - Subir archivo
- `GET /api/files/:id/download` - Descargar archivo
- `DELETE /api/files/:id` - Eliminar archivo
- `PATCH /api/files/:id/move` - Mover archivo

### Carpetas
- `GET /api/folders` - Listar carpetas
- `POST /api/folders` - Crear carpeta
- `DELETE /api/folders/:id` - Eliminar carpeta

## 🔒 Seguridad

### Características de Seguridad Implementadas
- **Validación de entrada** con Zod
- **Rate limiting** en endpoints críticos
- **CORS configurado** correctamente
- **CSP con Helmet**
- **Sanitización de nombres de archivo**
- **Validación de tipos de archivo**
- **Auditoría de acciones de administrador**
- **Protección CSRF**
- **Headers de seguridad**

### Buenas Prácticas
- Sin contraseñas en código
- Variables de entorno configuradas
- Dependencias actualizadas
- Logs de auditoría
- Validación estricta de tipos

## Personalización

La aplicación utiliza Tailwind CSS con un diseño personalizado. Puedes modificar:

- **Colores**: Edita `tailwind.config.js`
- **Componentes**: Modifica los archivos en `frontend/src/components/`
- **Layout**: Ajusta `frontend/src/app/layout.tsx`

## Despliegue

### Docker
```bash
docker-compose up -d
```

### Producción
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

### Guía de Estilo
- Usa TypeScript para todo el código nuevo
- Sigue las convenciones de ESLint
- Añade tests para nuevas funcionalidades
- Documenta los cambios relevantes

## 📄 Licencia

Este proyecto está bajo la Licencia MIT con restricciones comerciales. Ver el archivo [LICENSE](LICENSE) para más detalles.

### Restricciones Importantes
- ✅ Uso personal y comercial dentro de tu organización
- ❌ Revender o redistribuir como producto independiente
- ✅ Modificar para uso interno
- ❌ Eliminar avisos de copyright o licencia

## � Agradecimientos

- Next.js团队 por el excelente framework
- Tailwind CSS por las utilidades de diseño
- Prisma por el ORM moderno
- Lucide por los hermosos iconos

## � Soporte

Si tienes algún problema o sugerencia:

- Abre un [Issue](https://github.com/CloudShakes/cloud-shakes/issues)
- Contacta a través de [discussions](https://github.com/CloudShakes/cloud-shakes/discussions)

## 🔍 Auditoría de Seguridad

Este proyecto incluye:
- Validación de entrada con Zod
- Rate limiting configurable
- Auditoría de acciones administrativas
- Sanitización de archivos
- Headers de seguridad con Helmet
- Protección contra XSS y CSRF

Para reportes de seguridad, contacta: security@yourdomain.com

---

**Hecho con ❤️ por la comunidad de código abierto** ❤️