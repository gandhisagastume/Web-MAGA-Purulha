# CLAUDE.md — WebMAGA Purulhá

Guía de contexto para trabajar en este proyecto. Léela antes de tocar código.

## Qué es

Sistema web de **gestión territorial municipal** para el MAGA (Ministerio de
Agricultura, Ganadería y Alimentación) en **Purulhá, Baja Verapaz, Guatemala**.
Centraliza microrregiones, comunidades, proyectos/actividades, beneficiarios,
evidencias multimedia y reportes para los equipos municipales. Es una app interna
(no pública), pensada para uso en escritorio y móvil, con **soporte offline**
porque se usa en campo donde la conexión es intermitente.

Idioma del dominio: **español**. Nombres de modelos, tablas, variables y comentarios
están en español — mantén esa convención.

## Stack

- **Backend:** Django 5.2.7 (Python 3.13 local, 3.12 en build), una sola app: `webmaga`.
- **DB:** PostgreSQL (usa extensiones: `pgcrypto` para passwords, `django.contrib.postgres`).
- **Frontend:** templates Django + **JS vanilla** (sin framework, sin build step). Un `.js` por página en `src/static/js/`.
- **Estáticos:** WhiteNoise (`CompressedManifestStaticFilesStorage`).
- **PDF/Word/Excel:** WeasyPrint, ReportLab, python-docx, openpyxl, xhtml2pdf, docx2pdf.
- **Imágenes:** Pillow (compresión automática al subir).
- **Rate limiting:** django-ratelimit.
- **Server:** Gunicorn. **Deploy:** Nixpacks → Dokploy/Traefik (proxy reverso HTTPS).

## Estructura

```
config/                 # Proyecto Django (settings, urls raíz, wsgi/asgi)
  settings.py           # Config central — lee .env con python-dotenv
  urls.py               # urls raíz: /admin, /service-worker.js, media custom, incluye webmaga.urls
webmaga/                # ÚNICA app — toda la lógica vive aquí
  models.py             # ~40 modelos, todos con PK UUID (1229 líneas)
  views.py              # TODAS las APIs JSON (~15k líneas) — el archivo gigante
  views_pages.py        # Vistas HTML (render de templates) + login/logout
  views_utils.py        # Helpers de negocio (beneficiarios, portadas, cambios)
  urls.py               # ~140 rutas: páginas HTML + APIs /api/*
  authentication.py     # Backend de auth custom contra tabla `usuarios`
  decorators.py         # Control de acceso por rol (admin/personal)
  ratelimit_decorators.py
  middleware.py         # NoCacheMiddleware (no cachear HTML autenticado)
  context_processors.py # Inyecta usuario_maga/es_admin a todos los templates
  image_compression.py  # Compresión de imágenes subidas
  report_generator.py   # Generación de reportes PDF/Word/HTML (~3.8k líneas)
  forms.py, admin.py, apps.py
  migrations/           # OJO: historial frágil (ver Puntos débiles)
  management/commands/  # poblar_portadas_desde_evidencias.py
src/
  templates/            # 14 templates, base.html + una por página
  static/{css,js,img,svg}
media/                  # Archivos subidos por usuarios (NO en repo)
start.sh                # Entrypoint prod: crea carpetas media, migra, lanza gunicorn
nixpacks.toml           # Build (cairo/pango/libreoffice para PDF/Word)
```

## Modelo de datos (lo esencial)

**Convención global:** todos los modelos usan `id = UUIDField(primary_key)`,
timestamps `creado_en`/`actualizado_en`, y `db_table` explícito en español.

Entidades núcleo y sus relaciones:

- **Geografía:** `Region` (17 microrregiones) → `Comunidad` (tipo: barrio/caserío/aldea/municipio) → `ComunidadAutoridad` (COCODE).
- **Usuarios:** `Usuario` (rol `admin`|`personal`, auth propia, no usa `auth_user` de Django como fuente de verdad) · `Puesto` · `Colaborador` (personal interno/externo, puede o no estar vinculado a un `Usuario`) · `UsuarioFotoPerfil` · `PasswordResetCode`.
- **Actividades/Eventos** (en el código "evento" == `Actividad`): `Actividad` (tipo, comunidad, responsable/colaborador, estado) con satélites: `ActividadPersonal`, `ActividadComunidad`, `ActividadBeneficiario`, `ActividadPortada`, `ActividadArchivo`, `EventosGaleria`, `Evidencia`, `ActividadCambio`/`CambioEvidencia` (cambios por usuarios del sistema) y `EventoCambioColaborador`/`EventosEvidenciasCambios` (cambios por colaboradores).
- **Beneficiarios (polimórficos):** `Beneficiario` base → uno de `BeneficiarioIndividual` / `BeneficiarioFamilia` / `BeneficiarioInstitucion` (OneToOne). Individuales tienen `BeneficiarioFoto`, `BeneficiarioAtributo`(/`Tipo`) y `BeneficiarioReinscripcion`.
- **Offline/sync:** `DispositivoRegistrado`, `SesionOffline`, `ColaSincronizacion`, `ConflictoSincronizacion`. Las tablas sincronizables llevan `version`, `ultimo_sync`, `modificado_offline`.
- **Auditoría/otros:** `BitacoraTransaccion`, `Recordatorio`/`RecordatorioColaborador`, `TarjetaDato`.

⚠️ Modelos con **`managed = False`** (la tabla la maneja la BD, NO Django — no generes migraciones para ellos): `BeneficiarioReinscripcion`, `ActividadComunidad`, `ActividadPortada`.

## Autenticación y permisos

- Auth **custom** en `authentication.py` (`UsuarioMAGABackend`): valida contra la tabla `usuarios`, no contra `auth_user`. Passwords verificadas con **pgcrypto** (`crypt()`) o hashers de Django (compatibilidad). Tras login crea/sincroniza un `User` de Django espejo para la sesión (admin → `is_staff`/`is_superuser`).
- Bloqueo tras **5 intentos fallidos** → 30 min (`intentos_fallidos`, `bloqueado_hasta`).
- **2 roles:** `admin` (todo) y `personal` (solo eventos donde está asignado vía `ActividadPersonal`).
- Permisos por **decoradores** (`decorators.py`): `solo_administrador`, `permiso_gestionar_eventos[_api]`, `permiso_admin_o_personal_api`, `usuario_autenticado`, `permiso_generar_reportes`. Los `_api` devuelven JSON 401/403; los de página redirigen con `messages`.
- En templates usa las flags del context processor: `usuario_maga`, `es_admin`, `es_personal`, `puede_gestionar_eventos`, `puede_generar_reportes`.
- Sesiones: duran 7 días, persisten al cerrar navegador (crítico para Android/PWA).

## APIs (comunicación interna)

Patrón: el frontend (JS por página) hace `fetch` a endpoints `/api/...` que devuelven
**JSON** (`{success, ...}` / `{success:false, error}`). Las páginas HTML se sirven con
render de templates; los datos dinámicos se cargan por AJAX después.

- Todas las rutas en `webmaga/urls.py` (namespace `webmaga:`). IDs en URLs son `<uuid:...>`.
- Convención REST-ish: `/api/<entidad>/`, `/api/<entidad>/<uuid>/`, `+/actualizar/`, `+/eliminar/`, `+/galeria/agregar/`, etc.
- Escrituras suelen ir con `@csrf_exempt` + rate limit + decorador de rol. Lecturas con rate limit de lectura.
- Familias de endpoints: auth/recovery, usuario/perfil, regiones, comunidades, actividades/eventos (CRUD + galería + archivos + cambios + evidencias), beneficiarios (CRUD, import/export Excel, atributos, fotos, reinscripciones), gestión usuarios/colaboradores/puestos, proyectos, calendario/recordatorios, reportes.

## Offline / PWA

- `service-worker.js` se sirve **desde la raíz** por una vista custom en `config/urls.py` (para fijar header `Service-Worker-Allowed: /`). Cachea CSS/JS/assets clave.
- Cliente: `offline-auth.js`, `offline-db.js` (IndexedDB), `offline-sync.js` (cola en `localStorage`, intercepta `fetch`), `offline-diagnostico.js`. La cola cliente se concilia con `ColaSincronizacion`/`ConflictoSincronizacion` en servidor (versionado optimista por `version`).

## Reportes

`report_generator.py` genera PDF (ReportLab/WeasyPrint), Word (python-docx) y HTML para
~8 tipos de reporte (actividades por región/comunidad, beneficiarios, personal, avances,
evento individual, comunidades, general). En prod requiere libs nativas de cairo/pango
(ver `nixpacks.toml`) y libreoffice para conversión docx→pdf.

## Configuración / entorno

- Settings lee `.env` (`python-dotenv`). Claves: `KEY_DJANGO`, `DEBUG`, `DB_*`, `EMAIL_*`, `CSRF_TRUSTED_ORIGINS`.
- `DEBUG=False` activa automáticamente HSTS, cookies seguras, `SECURE_PROXY_SSL_HEADER` (Dokploy/Traefik), nosniff, X-Frame DENY.
- Zona horaria **forzada** a `America/Guatemala` (UTC-6) incluso a nivel de conexión PostgreSQL.
- Caché: LocMem en memoria (no Redis). Media servida por vista custom en prod.

## Comandos

```bash
# Local (Windows: venv\Scripts\activate)
python manage.py migrate
python manage.py runserver
python manage.py createsuperuser        # superuser Django (admin/)
python manage.py collectstatic --noinput

# Prod lo hace start.sh: crea carpetas media → migrate → gunicorn (4 workers)
```

## Puntos fuertes

- **Modelo de datos rico y normalizado**: cubre bien el dominio (geografía → comunidades → actividades → beneficiarios polimórficos) con auditoría e historial.
- **UUIDs en todo**: facilita sync offline y evita colisiones de IDs entre cliente/servidor.
- **Capacidad offline real** pensada para trabajo de campo (SW + IndexedDB + cola + resolución de conflictos versionada).
- **Seguridad razonable**: bloqueo por intentos, rate limiting, pgcrypto, endurecimiento automático en prod, validación de path en servir media.
- **Reportería completa** en múltiples formatos con plantillas institucionales.
- Sin build step de frontend → simple de desplegar y mantener para un equipo pequeño.

## Puntos débiles (ten cuidado aquí)

- **`views.py` monolítico (~15.000 líneas)**: difícil de navegar; lógica de negocio mezclada con HTTP. Al agregar features, considera apoyarte en `views_utils.py` y buscar el endpoint con grep en vez de leer todo.
- **Migraciones frágiles**: hay merges, `.backup`, migraciones "safe" y `start.sh` que marca migraciones como *fake* y parchea la 0010 a mano. No asumas que `makemigrations` está limpio; revisa antes de migrar. Respeta los modelos `managed=False`.
- **`ALLOWED_HOSTS = ['*']`** hardcodeado (ignora la variable de entorno) — riesgo en prod.
- **Auth de doble fuente** (`Usuario` MAGA + `User` Django espejo): puede desincronizarse; cualquier cambio de rol/estado debe pasar por el flujo de login para reflejarse.
- **`@csrf_exempt` extendido** en APIs de escritura: la protección recae en sesión + rate limit, no en CSRF token.
- **Caché LocMem + Gunicorn multi-worker**: la caché NO se comparte entre workers (cada worker tiene la suya); no la uses para estado que deba ser consistente.
- **Sin tests** efectivos (`tests.py` casi vacío). Valida cambios manualmente.
- **Archivos sueltos en la raíz** (`check.py`, `rescue_fix.py`, `reset_password.php`, `.txt` de análisis, `.docx/.pdf/.xlsx`): scripts ad-hoc/plantillas, no parte del runtime — no los tomes como referencia de arquitectura.
- **Fallback de password en texto plano** en `_check_password` (último recurso): no introduzcas dependencias en ese camino.

## Convenciones al contribuir

- Mantén el español en nombres, comentarios y mensajes de usuario.
- Toda escritura de API: decorador de rol + rate limit, respuesta `{success, ...}`.
- IDs siempre UUID; no rompas el patrón de `db_table` explícito.
- No generes migraciones para modelos `managed=False`.
- Imágenes subidas pasan por `image_compression.py`.
- Antes de migrar en prod, recuerda el manejo especial de `start.sh`.
</content>
</invoke>
