-- =====================================================
-- SCRIPT DE MIGRACIÃ"N: SEPARAR CAMBIOS DE COLABORADORES
-- Objetivo: Eliminar colaborador_id de actividad_cambios
--           Crear tabla eventos_cambios_colaboradores
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: CREAR NUEVA TABLA PARA CAMBIOS DE COLABORADORES
-- =====================================================

CREATE TABLE eventos_cambios_colaboradores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
    descripcion_cambio TEXT NOT NULL,
    fecha_cambio TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ãndices para la nueva tabla
CREATE INDEX idx_eventos_cambios_colab_actividad ON eventos_cambios_colaboradores(actividad_id);
CREATE INDEX idx_eventos_cambios_colab_colaborador ON eventos_cambios_colaboradores(colaborador_id);
CREATE INDEX idx_eventos_cambios_colab_fecha ON eventos_cambios_colaboradores(fecha_cambio DESC);

COMMENT ON TABLE eventos_cambios_colaboradores IS 'Cambios registrados por colaboradores en eventos/actividades';
COMMENT ON COLUMN eventos_cambios_colaboradores.colaborador_id IS 'Colaborador que registró el cambio';

-- =====================================================
-- PASO 2: MIGRAR DATOS EXISTENTES
-- =====================================================

-- Migrar registros que tienen colaborador_id a la nueva tabla
INSERT INTO eventos_cambios_colaboradores (
    id,
    actividad_id,
    colaborador_id,
    descripcion_cambio,
    fecha_cambio,
    creado_en
)
SELECT 
    id,
    actividad_id,
    colaborador_id,
    descripcion_cambio,
    fecha_cambio,
    creado_en
FROM actividad_cambios
WHERE colaborador_id IS NOT NULL;

-- Verificar cuántos registros se migraron
DO $$
DECLARE
    registros_migrados INTEGER;
BEGIN
    SELECT COUNT(*) INTO registros_migrados 
    FROM eventos_cambios_colaboradores;
    
    RAISE NOTICE '>> % registros migrados a eventos_cambios_colaboradores', registros_migrados;
END $$;

-- =====================================================
-- PASO 3: ELIMINAR REGISTROS MIGRADOS DE LA TABLA ORIGINAL
-- =====================================================

-- Eliminar los registros que ya fueron migrados
DELETE FROM actividad_cambios
WHERE colaborador_id IS NOT NULL;

-- Verificar cuántos registros quedaron
DO $$
DECLARE
    registros_restantes INTEGER;
BEGIN
    SELECT COUNT(*) INTO registros_restantes 
    FROM actividad_cambios;
    
    RAISE NOTICE '>> % registros restantes en actividad_cambios (solo de usuarios)', registros_restantes;
END $$;

-- =====================================================
-- PASO 4: ELIMINAR VISTAS QUE DEPENDEN DE LA COLUMNA
-- =====================================================

-- Eliminar las vistas que dependen de actividad_cambios.colaborador_id
DROP VIEW IF EXISTS vista_colaboradores_completos CASCADE;
DROP VIEW IF EXISTS vista_auditoria_colaboradores CASCADE;
DROP VIEW IF EXISTS vista_estadisticas_colaboradores_puesto CASCADE;

-- =====================================================
-- PASO 5: ELIMINAR COLUMNA colaborador_id Y REFERENCIAS
-- =====================================================

-- Primero eliminar el índice que usa esta columna
DROP INDEX IF EXISTS idx_actividad_cambios_colaborador;

-- Eliminar la columna colaborador_id
ALTER TABLE actividad_cambios 
DROP COLUMN IF EXISTS colaborador_id;

-- También eliminar la relación en eventos_evidencias_cambios si existe
-- (Esta tabla hace referencia a actividad_cambios, no necesita colaborador_id)

COMMENT ON TABLE actividad_cambios IS 'Cambios registrados por usuarios del sistema en eventos/actividades';

-- =====================================================
-- PASO 5: ACTUALIZAR VISTAS EXISTENTES
-- =====================================================

-- Recrear vista de actividades completas (sin colaborador en cambios)
DROP VIEW IF EXISTS vista_actividades_completas CASCADE;

CREATE VIEW vista_actividades_completas AS
SELECT 
    a.id,
    a.nombre,
    a.fecha,
    a.descripcion,
    a.estado,
    ta.nombre as tipo_actividad,
    ta.id as tipo_actividad_id,
    c.nombre as comunidad,
    c.codigo as comunidad_codigo,
    c.id as comunidad_id,
    r.nombre as region,
    r.id as region_id,
    u.username as responsable,
    u.id as responsable_id,
    u.rol as rol_responsable,
    p.nombre as puesto_responsable,
    col.id as colaborador_id,
    col.nombre as colaborador_nombre,
    col.telefono as colaborador_telefono,
    col.correo as colaborador_correo,
    col.es_personal_fijo as colaborador_es_personal_fijo,
    pcol.nombre as colaborador_puesto,
    a.latitud,
    a.longitud,
    COUNT(DISTINCT ab.beneficiario_id) as total_beneficiarios,
    COUNT(DISTINCT e.id) as total_evidencias,
    COUNT(DISTINCT ac.id) as total_cambios_usuarios,
    COUNT(DISTINCT ecc.id) as total_cambios_colaboradores,
    (COUNT(DISTINCT ac.id) + COUNT(DISTINCT ecc.id)) as total_cambios,
    a.creado_en,
    a.actualizado_en
FROM actividades a
LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
LEFT JOIN comunidades c ON a.comunidad_id = c.id
LEFT JOIN regiones r ON c.region_id = r.id
LEFT JOIN usuarios u ON a.responsable_id = u.id
LEFT JOIN puestos p ON u.puesto_id = p.id
LEFT JOIN colaboradores col ON a.colaborador_id = col.id
LEFT JOIN puestos pcol ON col.puesto_id = pcol.id
LEFT JOIN actividad_beneficiarios ab ON a.id = ab.actividad_id
LEFT JOIN evidencias e ON a.id = e.actividad_id
LEFT JOIN actividad_cambios ac ON a.id = ac.actividad_id
LEFT JOIN eventos_cambios_colaboradores ecc ON a.id = ecc.actividad_id
WHERE a.eliminado_en IS NULL
GROUP BY a.id, ta.nombre, ta.id, c.nombre, c.codigo, c.id, r.nombre, r.id, 
         u.username, u.id, u.rol, p.nombre,
         col.id, col.nombre, col.telefono, col.correo, col.es_personal_fijo, pcol.nombre;

-- =====================================================
-- PASO 6: ACTUALIZAR VISTA DE REPORTES
-- =====================================================

DROP VIEW IF EXISTS reporte_eventos CASCADE;

CREATE VIEW reporte_eventos AS
SELECT 
    a.id,
    a.nombre,
    a.fecha,
    EXTRACT(YEAR FROM a.fecha) as anio,
    EXTRACT(MONTH FROM a.fecha) as mes,
    EXTRACT(QUARTER FROM a.fecha) as trimestre,
    a.estado,
    ta.nombre as tipo_actividad,
    c.nombre as comunidad,
    c.codigo as comunidad_codigo,
    tc.nombre as tipo_comunidad,
    r.nombre as region,
    u.username as responsable,
    u.rol as rol_responsable,
    p.nombre as puesto_responsable,
    col.nombre as colaborador,
    col.correo as colaborador_correo,
    col.telefono as colaborador_telefono,
    pcol.nombre as colaborador_puesto,
    col.es_personal_fijo as colaborador_es_personal_fijo,
    COUNT(DISTINCT ab.beneficiario_id) as total_beneficiarios,
    COUNT(DISTINCT ap.usuario_id) as total_personal_usuarios,
    COUNT(DISTINCT ap.colaborador_id) as total_personal_colaboradores,
    COUNT(DISTINCT e.id) as total_evidencias,
    COUNT(DISTINCT ac.id) as total_actualizaciones_usuarios,
    COUNT(DISTINCT ecc.id) as total_actualizaciones_colaboradores,
    (COUNT(DISTINCT ac.id) + COUNT(DISTINCT ecc.id)) as total_actualizaciones,
    a.descripcion,
    a.creado_en,
    a.actualizado_en
FROM actividades a
LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
LEFT JOIN comunidades c ON a.comunidad_id = c.id
LEFT JOIN tipos_comunidad tc ON c.tipo_id = tc.id
LEFT JOIN regiones r ON c.region_id = r.id
LEFT JOIN usuarios u ON a.responsable_id = u.id
LEFT JOIN puestos p ON u.puesto_id = p.id
LEFT JOIN colaboradores col ON a.colaborador_id = col.id
LEFT JOIN puestos pcol ON col.puesto_id = pcol.id
LEFT JOIN actividad_beneficiarios ab ON a.id = ab.actividad_id
LEFT JOIN actividad_personal ap ON a.id = ap.actividad_id
LEFT JOIN evidencias e ON a.id = e.actividad_id
LEFT JOIN actividad_cambios ac ON a.id = ac.actividad_id
LEFT JOIN eventos_cambios_colaboradores ecc ON a.id = ecc.actividad_id
WHERE a.eliminado_en IS NULL
GROUP BY a.id, ta.nombre, c.nombre, c.codigo, tc.nombre, r.nombre, 
         u.username, u.rol, p.nombre,
         col.nombre, col.correo, col.telefono, pcol.nombre, col.es_personal_fijo;

-- =====================================================
-- PASO 7: ACTUALIZAR VISTA DE AVANCES
-- =====================================================

DROP VIEW IF EXISTS reporte_avances_eventos CASCADE;

CREATE VIEW reporte_avances_eventos AS
SELECT 
    a.id as actividad_id,
    a.nombre as actividad,
    a.fecha as fecha_actividad,
    a.estado,
    ta.nombre as tipo_actividad,
    c.nombre as comunidad,
    r.nombre as region,
    u.username as responsable,
    u.rol as rol_responsable,
    p.nombre as puesto_responsable,
    col.nombre as colaborador,
    col.correo as colaborador_correo,
    pcol.nombre as colaborador_puesto,
    COUNT(DISTINCT ab.beneficiario_id) as beneficiarios_registrados,
    COUNT(DISTINCT e.id) as evidencias_subidas,
    COUNT(DISTINCT aa.id) as archivos_adjuntos,
    COUNT(DISTINCT ac.id) as total_cambios_usuarios,
    COUNT(DISTINCT ecc.id) as total_cambios_colaboradores,
    (COUNT(DISTINCT ac.id) + COUNT(DISTINCT ecc.id)) as total_cambios,
    GREATEST(MAX(ac.fecha_cambio), MAX(ecc.fecha_cambio)) as ultima_actualizacion,
    uc.ultimos_cambios_usuarios,
    ucc.ultimos_cambios_colaboradores,
    COUNT(DISTINCT ap.usuario_id) as total_personal_usuarios,
    COUNT(DISTINCT ap.colaborador_id) as total_personal_colaboradores,
    STRING_AGG(DISTINCT u2.username, ', ' ORDER BY u2.username) as usuarios_asignados,
    STRING_AGG(DISTINCT col2.nombre, ', ' ORDER BY col2.nombre) as colaboradores_asignados,
    CASE 
        WHEN a.estado = 'completado' THEN 100
        WHEN a.estado = 'en_progreso' THEN 50
        WHEN a.estado = 'planificado' THEN 0
        ELSE 0
    END as porcentaje_completado,
    CASE WHEN COUNT(DISTINCT e.id) > 0 THEN TRUE ELSE FALSE END as tiene_evidencias,
    a.creado_en as fecha_creacion,
    a.actualizado_en as fecha_ultima_modificacion
FROM actividades a
LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
LEFT JOIN comunidades c ON a.comunidad_id = c.id
LEFT JOIN regiones r ON c.region_id = r.id
LEFT JOIN usuarios u ON a.responsable_id = u.id
LEFT JOIN puestos p ON u.puesto_id = p.id
LEFT JOIN colaboradores col ON a.colaborador_id = col.id
LEFT JOIN puestos pcol ON col.puesto_id = pcol.id
LEFT JOIN actividad_beneficiarios ab ON a.id = ab.actividad_id
LEFT JOIN evidencias e ON a.id = e.actividad_id
LEFT JOIN actividad_archivos aa ON a.id = aa.actividad_id
LEFT JOIN actividad_cambios ac ON a.id = ac.actividad_id
LEFT JOIN eventos_cambios_colaboradores ecc ON a.id = ecc.actividad_id
LEFT JOIN actividad_personal ap ON a.id = ap.actividad_id
LEFT JOIN usuarios u2 ON ap.usuario_id = u2.id
LEFT JOIN colaboradores col2 ON ap.colaborador_id = col2.id
LEFT JOIN LATERAL (
    SELECT STRING_AGG(s.descripcion_cambio, ' | ' ORDER BY s.fecha_cambio DESC) AS ultimos_cambios_usuarios
    FROM (
        SELECT DISTINCT ON (ac2.descripcion_cambio)
               ac2.descripcion_cambio, ac2.fecha_cambio
        FROM actividad_cambios ac2
        WHERE ac2.actividad_id = a.id
        ORDER BY ac2.descripcion_cambio, ac2.fecha_cambio DESC
        LIMIT 3
    ) s
) uc ON TRUE
LEFT JOIN LATERAL (
    SELECT STRING_AGG(s.descripcion_cambio, ' | ' ORDER BY s.fecha_cambio DESC) AS ultimos_cambios_colaboradores
    FROM (
        SELECT DISTINCT ON (ecc2.descripcion_cambio)
               ecc2.descripcion_cambio, ecc2.fecha_cambio
        FROM eventos_cambios_colaboradores ecc2
        WHERE ecc2.actividad_id = a.id
        ORDER BY ecc2.descripcion_cambio, ecc2.fecha_cambio DESC
        LIMIT 3
    ) s
) ucc ON TRUE
WHERE a.eliminado_en IS NULL
GROUP BY a.id, ta.nombre, c.nombre, r.nombre, u.username, u.rol, p.nombre, 
         col.nombre, col.correo, pcol.nombre, uc.ultimos_cambios_usuarios, ucc.ultimos_cambios_colaboradores;

-- =====================================================
-- PASO 8: ACTUALIZAR VISTA DE COLABORADORES
-- =====================================================

DROP VIEW IF EXISTS vista_colaboradores_completos CASCADE;

CREATE VIEW vista_colaboradores_completos AS
SELECT 
    c.id,
    c.nombre,
    c.descripcion,
    c.telefono,
    c.correo,
    c.dpi,
    c.es_personal_fijo,
    c.activo,
    p.nombre as puesto,
    p.codigo as puesto_codigo,
    p.descripcion as puesto_descripcion,
    u.id as usuario_id,
    u.username,
    u.email as usuario_email,
    u.rol as usuario_rol,
    u.activo as usuario_activo,
    COUNT(DISTINCT a.id) as total_actividades_asignadas,
    COUNT(DISTINCT CASE WHEN a.estado = 'completado' THEN a.id END) as actividades_completadas,
    COUNT(DISTINCT CASE WHEN a.estado = 'en_progreso' THEN a.id END) as actividades_en_progreso,
    COUNT(DISTINCT ap.actividad_id) as total_actividades_como_personal,
    COUNT(DISTINCT ecc.id) as total_cambios_registrados,
    c.creado_en,
    c.actualizado_en,
    uc.username as creado_por_username
FROM colaboradores c
LEFT JOIN puestos p ON c.puesto_id = p.id
LEFT JOIN usuarios u ON c.usuario_id = u.id
LEFT JOIN actividades a ON c.id = a.colaborador_id
LEFT JOIN actividad_personal ap ON c.id = ap.colaborador_id
LEFT JOIN eventos_cambios_colaboradores ecc ON c.id = ecc.colaborador_id
LEFT JOIN usuarios uc ON c.creado_por = uc.id
GROUP BY c.id, p.nombre, p.codigo, p.descripcion, u.id, u.username, u.email, u.rol, u.activo, uc.username;

-- =====================================================
-- PASO 9: CREAR NUEVA VISTA UNIFICADA DE CAMBIOS
-- =====================================================

CREATE VIEW vista_cambios_eventos_unificada AS
SELECT 
    ac.id,
    ac.actividad_id,
    'usuario' as tipo_autor,
    ac.responsable_id as autor_id,
    u.username as autor_nombre,
    u.email as autor_contacto,
    NULL::UUID as colaborador_id,
    ac.descripcion_cambio,
    ac.fecha_cambio,
    ac.creado_en
FROM actividad_cambios ac
LEFT JOIN usuarios u ON ac.responsable_id = u.id

UNION ALL

SELECT 
    ecc.id,
    ecc.actividad_id,
    'colaborador' as tipo_autor,
    NULL::UUID as autor_id,
    c.nombre as autor_nombre,
    c.correo as autor_contacto,
    ecc.colaborador_id,
    ecc.descripcion_cambio,
    ecc.fecha_cambio,
    ecc.creado_en
FROM eventos_cambios_colaboradores ecc
LEFT JOIN colaboradores c ON ecc.colaborador_id = c.id

ORDER BY fecha_cambio DESC;

COMMENT ON VIEW vista_cambios_eventos_unificada IS 'Vista unificada de todos los cambios (usuarios y colaboradores)';

-- =====================================================
-- PASO 10: ACTUALIZAR FUNCIÓN DE RESUMEN
-- =====================================================

DROP FUNCTION IF EXISTS obtener_resumen_sistema();

CREATE OR REPLACE FUNCTION obtener_resumen_sistema()
RETURNS TABLE (
    descripcion TEXT,
    cantidad BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'Total de Usuarios'::TEXT, COUNT(*)::BIGINT FROM usuarios
    UNION ALL
    SELECT 'Total de Colaboradores'::TEXT, COUNT(*)::BIGINT FROM colaboradores
    UNION ALL
    SELECT 'Colaboradores con Usuario'::TEXT, COUNT(*)::BIGINT FROM colaboradores WHERE usuario_id IS NOT NULL
    UNION ALL
    SELECT 'Colaboradores Externos'::TEXT, COUNT(*)::BIGINT FROM colaboradores WHERE es_personal_fijo = FALSE
    UNION ALL
    SELECT 'Total de Regiones'::TEXT, COUNT(*)::BIGINT FROM regiones
    UNION ALL
    SELECT 'Total de Comunidades'::TEXT, COUNT(*)::BIGINT FROM comunidades
    UNION ALL
    SELECT 'Total de Beneficiarios'::TEXT, COUNT(*)::BIGINT FROM beneficiarios
    UNION ALL
    SELECT 'Beneficiarios Individuales'::TEXT, COUNT(*)::BIGINT FROM beneficiarios_individuales
    UNION ALL
    SELECT 'Beneficiarios Familias'::TEXT, COUNT(*)::BIGINT FROM beneficiarios_familias
    UNION ALL
    SELECT 'Beneficiarios Instituciones'::TEXT, COUNT(*)::BIGINT FROM beneficiarios_instituciones
    UNION ALL
    SELECT 'Total de Actividades'::TEXT, COUNT(*)::BIGINT FROM actividades WHERE eliminado_en IS NULL
    UNION ALL
    SELECT 'Actividades Completadas'::TEXT, COUNT(*)::BIGINT FROM actividades WHERE estado = 'completado' AND eliminado_en IS NULL
    UNION ALL
    SELECT 'Actividades en Progreso'::TEXT, COUNT(*)::BIGINT FROM actividades WHERE estado = 'en_progreso' AND eliminado_en IS NULL
    UNION ALL
    SELECT 'Actividades Planificadas'::TEXT, COUNT(*)::BIGINT FROM actividades WHERE estado = 'planificado' AND eliminado_en IS NULL
    UNION ALL
    SELECT 'Total de Evidencias'::TEXT, COUNT(*)::BIGINT FROM evidencias
    UNION ALL
    SELECT 'Cambios por Usuarios'::TEXT, COUNT(*)::BIGINT FROM actividad_cambios
    UNION ALL
    SELECT 'Cambios por Colaboradores'::TEXT, COUNT(*)::BIGINT FROM eventos_cambios_colaboradores
    UNION ALL
    SELECT 'Cambios Pendientes de Sincronización'::TEXT, COUNT(*)::BIGINT FROM cola_sincronizacion WHERE sincronizado = FALSE
    UNION ALL
    SELECT 'Conflictos de Sincronización'::TEXT, COUNT(*)::BIGINT FROM conflictos_sincronizacion WHERE resuelto = FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 11: ACTUALIZAR FUNCIÓN DE AUDITORÍA
-- =====================================================

DROP VIEW IF EXISTS vista_auditoria_colaboradores CASCADE;

CREATE VIEW vista_auditoria_colaboradores AS
SELECT 
    c.id,
    c.nombre,
    c.es_personal_fijo,
    c.activo,
    p.nombre as puesto,
    CASE WHEN c.usuario_id IS NOT NULL THEN 'Sí' ELSE 'No' END as tiene_usuario,
    u.username,
    u.activo as usuario_activo,
    COUNT(DISTINCT a.id) FILTER (WHERE a.eliminado_en IS NULL) as total_actividades,
    COUNT(DISTINCT a.id) FILTER (WHERE a.estado IN ('planificado', 'en_progreso') AND a.eliminado_en IS NULL) as actividades_activas,
    COUNT(DISTINCT ecc.id) as total_cambios_registrados,
    MAX(a.fecha) as ultima_actividad_asignada,
    MAX(ecc.fecha_cambio) as ultimo_cambio_registrado,
    c.creado_en,
    c.actualizado_en,
    CASE 
        WHEN c.es_personal_fijo = TRUE AND c.usuario_id IS NULL THEN '[!] Falta Usuario'
        WHEN c.es_personal_fijo = FALSE AND c.usuario_id IS NOT NULL THEN '[!] Usuario Inesperado'
        WHEN c.activo = FALSE AND EXISTS (
            SELECT 1 FROM actividades a2 
            WHERE a2.colaborador_id = c.id 
            AND a2.estado IN ('planificado', 'en_progreso')
            AND a2.eliminado_en IS NULL
        ) THEN '[!] Inactivo con Actividades Activas'
        ELSE '[OK] OK'
    END as estado_integridad
FROM colaboradores c
LEFT JOIN puestos p ON c.puesto_id = p.id
LEFT JOIN usuarios u ON c.usuario_id = u.id
LEFT JOIN actividades a ON c.id = a.colaborador_id
LEFT JOIN eventos_cambios_colaboradores ecc ON c.id = ecc.colaborador_id
GROUP BY c.id, c.nombre, c.es_personal_fijo, c.activo, p.nombre, c.usuario_id, u.username, u.activo, c.creado_en, c.actualizado_en;

-- =====================================================
-- PASO 12: ACTUALIZAR ESTADÍSTICAS POR PUESTO
-- =====================================================

DROP VIEW IF EXISTS vista_estadisticas_colaboradores_puesto CASCADE;

CREATE VIEW vista_estadisticas_colaboradores_puesto AS
SELECT 
    p.id as puesto_id,
    p.codigo as puesto_codigo,
    p.nombre as puesto,
    COUNT(DISTINCT c.id) as total_colaboradores,
    COUNT(DISTINCT c.id) FILTER (WHERE c.es_personal_fijo = TRUE) as personal_fijo,
    COUNT(DISTINCT c.id) FILTER (WHERE c.es_personal_fijo = FALSE) as colaboradores_externos,
    COUNT(DISTINCT c.id) FILTER (WHERE c.activo = TRUE) as colaboradores_activos,
    COUNT(DISTINCT c.id) FILTER (WHERE c.usuario_id IS NOT NULL) as con_usuario,
    COUNT(DISTINCT a.id) as total_actividades_asignadas,
    COUNT(DISTINCT a.id) FILTER (WHERE a.estado = 'completado') as actividades_completadas,
    COUNT(DISTINCT ecc.id) as total_cambios_registrados
FROM puestos p
LEFT JOIN colaboradores c ON p.id = c.puesto_id
LEFT JOIN actividades a ON c.id = a.colaborador_id AND a.eliminado_en IS NULL
LEFT JOIN eventos_cambios_colaboradores ecc ON c.id = ecc.colaborador_id
WHERE p.activo = TRUE
GROUP BY p.id, p.codigo, p.nombre
ORDER BY total_colaboradores DESC;

COMMIT;

-- =====================================================
-- ROLLBACK (En caso de error, descomentar y ejecutar)
-- =====================================================
-- ROLLBACK;

-- =====================================================
-- SCRIPT PARA CORREGIR FOREIGN KEY DE eventos_evidencias_cambios
-- Objetivo: Cambiar la foreign key cambio_id para que apunte a eventos_cambios_colaboradores
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: ELIMINAR LA FOREIGN KEY EXISTENTE
-- =====================================================

-- Eliminar la constraint de foreign key existente
ALTER TABLE eventos_evidencias_cambios 
DROP CONSTRAINT IF EXISTS eventos_evidencias_cambios_cambio_id_fkey;

-- =====================================================
-- PASO 2: CREAR NUEVA FOREIGN KEY APUNTANDO A eventos_cambios_colaboradores
-- =====================================================

-- Crear la nueva foreign key que apunta a eventos_cambios_colaboradores
ALTER TABLE eventos_evidencias_cambios
ADD CONSTRAINT eventos_evidencias_cambios_cambio_id_fkey
FOREIGN KEY (cambio_id) 
REFERENCES eventos_cambios_colaboradores(id) 
ON DELETE CASCADE;

-- =====================================================
-- PASO 3: VERIFICAR INTEGRIDAD DE DATOS
-- =====================================================

-- Verificar si hay evidencias con cambio_id que no existen en eventos_cambios_colaboradores
DO $$
DECLARE
    evidencias_huérfanas INTEGER;
BEGIN
    SELECT COUNT(*) INTO evidencias_huérfanas
    FROM eventos_evidencias_cambios eec
    WHERE NOT EXISTS (
        SELECT 1 FROM eventos_cambios_colaboradores ecc 
        WHERE ecc.id = eec.cambio_id
    );
    
    IF evidencias_huérfanas > 0 THEN
        RAISE WARNING '⚠️ Se encontraron % evidencias con cambio_id que no existe en eventos_cambios_colaboradores', evidencias_huérfanas;
        RAISE WARNING '⚠️ Estas evidencias deben ser migradas o eliminadas manualmente';
    ELSE
        RAISE NOTICE '✅ Todas las evidencias tienen un cambio_id válido en eventos_cambios_colaboradores';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- ROLLBACK (En caso de error, descomentar y ejecutar)
-- =====================================================
-- ROLLBACK;

