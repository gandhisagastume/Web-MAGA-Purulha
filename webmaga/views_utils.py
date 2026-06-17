from datetime import datetime
import os
import re

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db.models import F, Value
from django.db.models.functions import Coalesce, Replace
from django.utils import timezone

from .models import (
    Actividad,
    ActividadBeneficiario,
    ActividadComunidad,
    ActividadPortada,
    Beneficiario,
    BeneficiarioFamilia,
    BeneficiarioIndividual,
    BeneficiarioInstitucion,
    Colaborador,
    Comunidad,
    EventoCambioColaborador,
    EventosEvidenciasCambios,
    TarjetaDato,
)


def normalizar_dpi(valor):
    """Devuelve una cadena de solo dígitos para comparaciones de DPI."""
    if not valor:
        return ''
    return re.sub(r'\D', '', str(valor))


def _expresion_dpi_normalizado(field_name):
    """Construye una expresión que elimina caracteres comunes en el DPI."""
    expr = Coalesce(F(field_name), Value(''))
    for caracter in (' ', '-', '_', '/', '.', '\t', '\u00a0'):
        expr = Replace(expr, Value(caracter), Value(''))
    return expr


def buscar_conflicto_dpi(queryset, field_name, valor, beneficiario_excluir=None):
    """
    Busca si existe un registro con el mismo DPI (normalizado) en el queryset.
    Retorna la instancia encontrada o None.
    """
    valor_normalizado = normalizar_dpi(valor)
    if not valor_normalizado:
        return None

    expr = _expresion_dpi_normalizado(field_name)
    qs = queryset.filter(beneficiario__activo=True).annotate(
        _dpi_normalizado=expr
    )
    if beneficiario_excluir is not None:
        qs = qs.exclude(beneficiario=beneficiario_excluir)

    return qs.filter(_dpi_normalizado=valor_normalizado).first()


def obtener_detalle_beneficiario(beneficiario):
    """Devuelve nombre para mostrar, info adicional, detalles y tipo efectivo del beneficiario."""
    nombre_display = ''
    info_adicional = ''
    detalles = {}
    tipo_envio = beneficiario.tipo.nombre if beneficiario.tipo else ''

    if hasattr(beneficiario, 'individual'):
        ind = beneficiario.individual
        # Construir nombre completo usando nuevos campos si existen (usar getattr para seguridad)
        primer_nombre = getattr(ind, 'primer_nombre', None) or getattr(ind, 'nombre', None) or ''
        segundo_nombre = getattr(ind, 'segundo_nombre', None) or ''
        tercer_nombre = getattr(ind, 'tercer_nombre', None) or ''
        primer_apellido = getattr(ind, 'primer_apellido', None) or getattr(ind, 'apellido', None) or ''
        segundo_apellido = getattr(ind, 'segundo_apellido', None) or ''
        
        nombres = [n for n in [primer_nombre, segundo_nombre, tercer_nombre] if n]
        apellidos = [a for a in [primer_apellido, segundo_apellido] if a]
        nombre_completo = ' '.join(nombres) + (' ' + ' '.join(apellidos) if apellidos else '')
        nombre_display = nombre_completo.strip() or f"{getattr(ind, 'nombre', '')} {getattr(ind, 'apellido', '')}".strip()
        info_adicional = getattr(ind, 'dpi', None) or ''
        detalles = {
            'nombre': getattr(ind, 'nombre', '') or '',
            'apellido': getattr(ind, 'apellido', '') or '',
            'primer_nombre': primer_nombre,
            'segundo_nombre': segundo_nombre,
            'tercer_nombre': tercer_nombre,
            'primer_apellido': primer_apellido,
            'segundo_apellido': segundo_apellido,
            'apellido_casada': getattr(ind, 'apellido_casada', None) or '',
            'comunidad_linguistica': getattr(ind, 'comunidad_linguistica', None) or '',
            'dpi': getattr(ind, 'dpi', None) or '',
            'fecha_nacimiento': str(getattr(ind, 'fecha_nacimiento', None)) if getattr(ind, 'fecha_nacimiento', None) else '',
            'edad': getattr(ind, 'edad', None) if hasattr(ind, 'edad') and getattr(ind, 'edad', None) else '',
            'genero': getattr(ind, 'genero', None) or '',
            'telefono': getattr(ind, 'telefono', None) or '',
            'display_name': nombre_display,
        }
    elif hasattr(beneficiario, 'familia'):
        fam = beneficiario.familia
        nombre_display = fam.nombre_familia
        info_adicional = f"Jefe: {fam.jefe_familia}" if fam.jefe_familia else ''
        detalles = {
            'nombre_familia': fam.nombre_familia,
            'jefe_familia': fam.jefe_familia,
            'dpi_jefe_familia': fam.dpi_jefe_familia or '',
            'telefono': fam.telefono or '',
            'numero_miembros': fam.numero_miembros or '',
            'display_name': nombre_display,
        }
    elif hasattr(beneficiario, 'institucion'):
        inst = beneficiario.institucion
        nombre_display = inst.nombre_institucion
        info_adicional = inst.tipo_institucion or ''
        if (beneficiario.tipo and beneficiario.tipo.nombre.lower() == 'otro') or (
            inst.tipo_institucion or ''
        ).lower() == 'otro':
            tipo_envio = 'otro'
            detalles = {
                'nombre': inst.nombre_institucion,
                'tipo_descripcion': inst.email or inst.tipo_institucion,
                'contacto': inst.representante_legal or '',
                'telefono': inst.telefono or '',
                'descripcion': '',
                'display_name': nombre_display,
            }
        else:
            detalles = {
                'nombre_institucion': inst.nombre_institucion,
                'tipo_institucion': inst.tipo_institucion,
                'representante_legal': inst.representante_legal or '',
                'dpi_representante': inst.dpi_representante or '',
                'telefono': inst.telefono or '',
                'email': inst.email or '',
                'numero_beneficiarios_directos': inst.numero_beneficiarios_directos or '',
                'display_name': nombre_display,
            }
    else:
        nombre_display = f"Beneficiario {beneficiario.id}"

    comunidad = beneficiario.comunidad
    detalles['comunidad_id'] = str(comunidad.id) if comunidad else None
    detalles['comunidad_nombre'] = comunidad.nombre if comunidad else None
    detalles['region_id'] = str(comunidad.region_id) if comunidad and comunidad.region_id else None
    detalles['region_nombre'] = comunidad.region.nombre if comunidad and comunidad.region else None
    detalles['region_sede'] = (
        comunidad.region.comunidad_sede
        if comunidad and comunidad.region and comunidad.region.comunidad_sede
        else None
    )

    return nombre_display, info_adicional, detalles, tipo_envio


def aplicar_modificaciones_beneficiarios(beneficiarios_modificados):
    """Actualiza registros existentes de beneficiarios y devuelve la cantidad de cambios aplicados."""
    cambios_aplicados = 0

    for benef_data in beneficiarios_modificados:
        benef_id = benef_data.get('id')
        if not benef_id:
            continue

        try:
            beneficiario = Beneficiario.objects.get(id=benef_id)
        except Beneficiario.DoesNotExist:
            print(f"WARNING Beneficiario {benef_id} no encontrado")
            continue

        tipo = benef_data.get('tipo')
        try:
            if tipo == 'individual':
                benef_ind = BeneficiarioIndividual.objects.get(beneficiario=beneficiario)
                nuevo_dpi = normalizar_dpi(benef_data.get('dpi'))
                if nuevo_dpi:
                    dpi_existente = buscar_conflicto_dpi(
                        BeneficiarioIndividual.objects.all(),
                        'dpi',
                        nuevo_dpi,
                        beneficiario,
                    )
                    if dpi_existente:
                        raise ValueError(f'Ya existe un beneficiario individual con el DPI {nuevo_dpi}.')

                benef_ind.nombre = benef_data.get('nombre', benef_ind.nombre)
                benef_ind.apellido = benef_data.get('apellido', benef_ind.apellido)
                benef_ind.dpi = nuevo_dpi or None
                benef_ind.fecha_nacimiento = benef_data.get('fecha_nacimiento')
                benef_ind.genero = benef_data.get('genero')
                benef_ind.telefono = benef_data.get('telefono')
                benef_ind.save()
                cambios_aplicados += 1
                print(
                    f"OK Beneficiario individual actualizado: {benef_ind.nombre} {benef_ind.apellido}"
                )

            elif tipo == 'familia':
                benef_fam = BeneficiarioFamilia.objects.get(beneficiario=beneficiario)
                nuevo_dpi_jefe = normalizar_dpi(benef_data.get('dpi_jefe_familia'))
                if nuevo_dpi_jefe:
                    dpi_existente = buscar_conflicto_dpi(
                        BeneficiarioFamilia.objects.all(),
                        'dpi_jefe_familia',
                        nuevo_dpi_jefe,
                        beneficiario,
                    )
                    if dpi_existente:
                        raise ValueError(
                            f'Ya existe una familia con el DPI del jefe {nuevo_dpi_jefe}.'
                        )

                benef_fam.nombre_familia = benef_data.get('nombre_familia', benef_fam.nombre_familia)
                benef_fam.jefe_familia = benef_data.get('jefe_familia', benef_fam.jefe_familia)
                benef_fam.dpi_jefe_familia = nuevo_dpi_jefe or None
                benef_fam.telefono = benef_data.get('telefono')
                benef_fam.numero_miembros = benef_data.get('numero_miembros')
                benef_fam.save()
                cambios_aplicados += 1
                print(f"OK Beneficiario familia actualizado: {benef_fam.nombre_familia}")

            elif tipo in ('institucion', 'institución'):
                benef_inst = BeneficiarioInstitucion.objects.get(beneficiario=beneficiario)
                nuevo_dpi_rep = normalizar_dpi(benef_data.get('dpi_representante'))
                if nuevo_dpi_rep:
                    dpi_existente = buscar_conflicto_dpi(
                        BeneficiarioInstitucion.objects.all(),
                        'dpi_representante',
                        nuevo_dpi_rep,
                        beneficiario,
                    )
                    if dpi_existente:
                        raise ValueError(
                            f'Ya existe una institución con el DPI del representante {nuevo_dpi_rep}.'
                        )

                benef_inst.nombre_institucion = benef_data.get(
                    'nombre_institucion', benef_inst.nombre_institucion
                )
                benef_inst.tipo_institucion = benef_data.get(
                    'tipo_institucion', benef_inst.tipo_institucion
                )
                benef_inst.representante_legal = benef_data.get('representante_legal')
                benef_inst.dpi_representante = nuevo_dpi_rep or None
                benef_inst.telefono = benef_data.get('telefono')
                benef_inst.email = benef_data.get('email')
                benef_inst.numero_beneficiarios_directos = benef_data.get(
                    'numero_beneficiarios_directos'
                )
                benef_inst.save()
                cambios_aplicados += 1
                print(f"OK Beneficiario institución actualizado: {benef_inst.nombre_institucion}")

            elif tipo == 'otro':
                benef_inst = BeneficiarioInstitucion.objects.get(beneficiario=beneficiario)
                benef_inst.nombre_institucion = benef_data.get('nombre', benef_inst.nombre_institucion)
                benef_inst.tipo_institucion = 'otro'
                benef_inst.representante_legal = benef_data.get('contacto')
                benef_inst.telefono = benef_data.get('telefono')
                benef_inst.email = benef_data.get('tipo_descripcion')
                benef_inst.save()
                cambios_aplicados += 1
                print(f"OK Beneficiario tipo 'otro' actualizado: {benef_inst.nombre_institucion}")

        except (
            BeneficiarioIndividual.DoesNotExist,
            BeneficiarioFamilia.DoesNotExist,
            BeneficiarioInstitucion.DoesNotExist,
        ):
            print(f"WARNING No se encontró el registro específico para el beneficiario {benef_id}")
            continue

        comunidad_id_nueva = benef_data.get('comunidad_id')
        if comunidad_id_nueva and str(beneficiario.comunidad_id) != str(comunidad_id_nueva):
            beneficiario.comunidad_id = comunidad_id_nueva
            beneficiario.save(update_fields=['comunidad'])
            cambios_aplicados += 1

    return cambios_aplicados


def obtener_comunidades_evento(evento):
    """Devuelve un listado de comunidades asociadas a la actividad con información de región."""
    comunidades_detalle = []

    relaciones = []
    if hasattr(evento, 'comunidades_relacionadas'):
        relaciones = evento.comunidades_relacionadas.all()

    for relacion in relaciones:
        comunidad = relacion.comunidad
        region = relacion.region or (comunidad.region if comunidad and comunidad.region else None)
        comunidades_detalle.append(
            {
                'comunidad_id': str(comunidad.id) if comunidad else None,
                'comunidad_nombre': comunidad.nombre if comunidad else None,
                'region_id': str(region.id) if region else None,
                'region_nombre': region.nombre if region else None,
                'region_sede': region.comunidad_sede if getattr(region, 'comunidad_sede', None) else None,
                'agregado_en': relacion.creado_en.isoformat() if getattr(relacion, 'creado_en', None) else None,
            }
        )

    if not comunidades_detalle and evento.comunidad:
        region = evento.comunidad.region
        comunidades_detalle.append(
            {
                'comunidad_id': str(evento.comunidad.id),
                'comunidad_nombre': evento.comunidad.nombre,
                'region_id': str(region.id) if region else None,
                'region_nombre': region.nombre if region else None,
                'region_sede': region.comunidad_sede if region else None,
                'agregado_en': None,
            }
        )

    return comunidades_detalle


def obtener_tarjetas_datos(evento):
    """Retorna las tarjetas de datos asociadas a una actividad sin duplicados."""
    tarjetas = []
    qs = (
        TarjetaDato.objects.filter(entidad_tipo='actividad', entidad_id=evento.id)
        .order_by('orden', 'creado_en')
        .distinct()
    )

    ids_vistos = set()

    for tarjeta in qs:
        tarjeta_id = str(tarjeta.id)
        if tarjeta_id in ids_vistos:
            print(f'WARNING Tarjeta duplicada detectada en BD: {tarjeta.titulo} (ID: {tarjeta_id})')
            continue

        ids_vistos.add(tarjeta_id)
        tarjetas.append(
            {
                'id': tarjeta_id,
                'titulo': tarjeta.titulo,
                'valor': tarjeta.valor,
                'icono': tarjeta.icono,
                'orden': tarjeta.orden,
                'es_favorita': tarjeta.es_favorita,
            }
        )

    return tarjetas


def obtener_cambios_evento(evento):
    """Obtiene los cambios realizados en un evento agrupados por grupo (varios colaboradores)."""
    print(f'SEARCH Buscando cambios (colaboradores) para evento {evento.id} - {evento.nombre}')

    # Verificar si las columnas comunidad_id y region_id existen en la tabla
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'eventos_cambios_colaboradores' 
                AND column_name IN ('comunidad_id', 'region_id');
            """)
            existing_columns = {row[0] for row in cursor.fetchall()}
            has_comunidad = 'comunidad_id' in existing_columns
            has_region = 'region_id' in existing_columns
    except Exception as e:
        # Si hay un error al verificar, asumir que las columnas no existen
        print(f'WARNING Error al verificar columnas: {e}')
        has_comunidad = False
        has_region = False

    # Construir select_related dinámicamente según las columnas disponibles
    select_related_fields = ['colaborador']
    if has_comunidad:
        select_related_fields.append('comunidad')
    if has_region:
        select_related_fields.append('region')

    # El usuario solicitó eliminar la limitación de número o paginación para poder ver y editar todos los cambios
    # Se remueve MAX_CAMBIOS_VISTA = 50
    cambios_queryset = (
        EventoCambioColaborador.objects.filter(actividad=evento)
        .select_related(*select_related_fields)
        .order_by('-fecha_cambio', '-creado_en')
    )
    cambios_total = cambios_queryset.count()
    # Obtener todos los cambios (sin limitación)
    cambios = list(cambios_queryset)
    print(f'SEARCH Total de cambios encontrados: {cambios_total} (mostrando {len(cambios)})')
    # Verificar si hay cambios con comunidades (solo si la columna existe)
    # Usar el queryset original antes del slice para filtrar
    if has_comunidad:
        try:
            cambios_con_comunidad_queryset = cambios_queryset.exclude(comunidad__isnull=True)
            cambios_con_comunidad_total = cambios_con_comunidad_queryset.count()
            print(f'SEARCH Cambios con comunidad: {cambios_con_comunidad_total}')
            for cambio_temp in cambios[:5]:  # Solo los primeros 5 para no saturar logs
                if getattr(cambio_temp, 'comunidad_id', None):
                    print(f'  - Cambio {cambio_temp.id}: comunidad_id={cambio_temp.comunidad_id}, comunidad={getattr(cambio_temp, "comunidad", None)}')
        except Exception as e:
            print(f'WARNING Error al filtrar por comunidad: {e}')

    cambios_por_grupo = {}
    
    # Pre-cargar todas las evidencias por grupo_id para evitar duplicados
    # cuando hay múltiples colaboradores en el mismo grupo
    from webmaga.models import EventosEvidenciasCambios
    evidencias_por_grupo = {}
    grupos_unicos = set()
    for cambio in cambios:
        grupo_uuid = getattr(cambio, 'grupo_id', None) or cambio.id
        grupos_unicos.add(grupo_uuid)
    
    # Pre-cargar evidencias por grupo una sola vez
    for grupo_uuid in grupos_unicos:
        grupo_clave = str(grupo_uuid)
        # Obtener todos los cambios del mismo grupo
        cambios_del_grupo = list(EventoCambioColaborador.objects.filter(
            actividad=evento,
            grupo_id=grupo_uuid
        ).values_list('id', flat=True))
        print(f'SEARCH Grupo {grupo_clave}: Cambios del grupo: {cambios_del_grupo}')
        
        # Obtener todas las evidencias de todos los cambios del grupo
        # Usar un diccionario para evitar duplicados por ID (más compatible con todas las bases de datos)
        # También verificar duplicados por URL de almacenamiento para evitar el mismo archivo múltiples veces
        evidencias_temp = {}
        evidencias_por_url = {}  # Diccionario adicional para verificar duplicados por URL
        if cambios_del_grupo:
            # Usar una consulta directa con distinct para evitar duplicados a nivel de base de datos
            evidencias_qs = EventosEvidenciasCambios.objects.filter(
                actividad=evento,
                cambio_id__in=cambios_del_grupo
            ).order_by('creado_en')
            
            print(f'ATTACH Grupo {grupo_clave}: Evidencias encontradas en BD: {evidencias_qs.count()}')
            
            # Agregar al diccionario usando ID como clave para asegurar unicidad
            # También verificar si ya existe una evidencia con la misma URL (mismo archivo físico)
            for evidencia in evidencias_qs:
                evidencia_key = str(evidencia.id)
                evidencia_url = evidencia.url_almacenamiento or ''
                
                # Verificar si ya existe una evidencia con la misma URL (mismo archivo físico)
                if evidencia_url in evidencias_por_url:
                    print(f'  WARNING Evidencia {evidencia.id} ({evidencia.archivo_nombre}) con URL duplicada - omitida (ya existe evidencia {evidencias_por_url[evidencia_url].id})')
                    continue
                
                # Solo agregar si no existe ya por ID (evita duplicados por seguridad)
                if evidencia_key not in evidencias_temp:
                    evidencias_temp[evidencia_key] = evidencia
                    evidencias_por_url[evidencia_url] = evidencia
                    print(f'  OK Evidencia {evidencia.id} ({evidencia.archivo_nombre}) agregada al grupo {grupo_clave}')
                else:
                    print(f'  WARNING Evidencia {evidencia.id} ({evidencia.archivo_nombre}) ya existe en el grupo {grupo_clave} por ID - omitida')
        
        evidencias_por_grupo[grupo_clave] = list(evidencias_temp.values())
        print(f'BOX Grupo {grupo_clave}: Total de evidencias únicas (por ID y URL): {len(evidencias_por_grupo[grupo_clave])}')

    for cambio in cambios:
        grupo_uuid = getattr(cambio, 'grupo_id', None) or cambio.id
        grupo_clave = str(grupo_uuid)
        colaborador = cambio.colaborador
        colaborador_id_str = str(colaborador.id) if colaborador else None
        responsable_nombre = colaborador.nombre if colaborador else 'Colaborador desconocido'

        if grupo_clave not in cambios_por_grupo:
            fecha_display = ''
            if cambio.fecha_cambio:
                import pytz

                guatemala_tz = pytz.timezone('America/Guatemala')
                if timezone.is_aware(cambio.fecha_cambio):
                    fecha_local = cambio.fecha_cambio.astimezone(guatemala_tz)
                else:
                    fecha_local = timezone.make_aware(cambio.fecha_cambio, guatemala_tz)
                fecha_display = fecha_local.strftime('%d/%m/%Y %H:%M')

            # Obtener evidencias del grupo (ya pre-cargadas y sin duplicados)
            evidencias_lista = evidencias_por_grupo.get(grupo_clave, [])
            print(f'ATTACH Evidencias encontradas para grupo {grupo_clave}: {len(evidencias_lista)}')
            
            # Preparar evidencias como diccionario usando ID como clave
            evidencias_dict_inicial = {}
            for evidencia in evidencias_lista:
                evidencia_key = str(evidencia.id)
                archivo_tipo = evidencia.archivo_tipo or ''
                es_imagen = archivo_tipo.startswith('image/') if archivo_tipo else False
                evidencias_dict_inicial[evidencia_key] = {
                    'id': str(evidencia.id),
                    'nombre': evidencia.archivo_nombre,
                    'url': evidencia.url_almacenamiento,
                    'tipo': archivo_tipo,
                    'es_imagen': es_imagen,
                    'descripcion': evidencia.descripcion or '',
                }

            cambios_por_grupo[grupo_clave] = {
                'id': str(cambio.id),
                'ids': [],
                'grupo_id': grupo_clave,
                'descripcion': cambio.descripcion_cambio,
                'fecha_cambio': cambio.fecha_cambio.isoformat() if cambio.fecha_cambio else None,
                'fecha_display': fecha_display,
                'responsables': [],
                'responsables_display': '',
                'colaboradores_ids': [],
                'colaboradores': [],
                'evidencias_dict': evidencias_dict_inicial,  # Inicializar con evidencias del grupo
                'comunidades': [],  # Lista de nombres de comunidades
            }

        grupo_data = cambios_por_grupo[grupo_clave]
        grupo_data['ids'].append(str(cambio.id))

        if colaborador_id_str and colaborador_id_str not in grupo_data['colaboradores_ids']:
            grupo_data['colaboradores_ids'].append(colaborador_id_str)
            grupo_data['colaboradores'].append({
                'id': colaborador_id_str,
                'nombre': colaborador.nombre,
                'puesto': colaborador.puesto.nombre if colaborador and colaborador.puesto else '',
                'rol_display': 'Personal Fijo' if colaborador and colaborador.es_personal_fijo else 'Colaborador Externo',
            })

        if responsable_nombre not in grupo_data['responsables']:
            grupo_data['responsables'].append(responsable_nombre)

        # Agregar comunidad si existe y no está ya en la lista
        # Leer directamente desde comunidad_id de la tabla eventos_cambios_colaboradores
        try:
            comunidad_id = getattr(cambio, 'comunidad_id', None)
            print(f'SEARCH Cambio {cambio.id}: comunidad_id={comunidad_id}, comunidad={getattr(cambio, "comunidad", None)}')
            
            if comunidad_id:
                # Si tenemos el ID pero no el objeto, obtenerlo
                cambio_comunidad = getattr(cambio, 'comunidad', None)
                if not cambio_comunidad:
                    from webmaga.models import Comunidad
                    try:
                        cambio_comunidad = Comunidad.objects.get(id=comunidad_id)
                    except Comunidad.DoesNotExist:
                        print(f'WARNING Comunidad con ID {comunidad_id} no encontrada en la BD')
                        cambio_comunidad = None
                
                if cambio_comunidad:
                    comunidad_nombre = cambio_comunidad.nombre
                    print(f'OK Comunidad encontrada: {comunidad_nombre} (ID: {comunidad_id})')
                    if comunidad_nombre and comunidad_nombre not in grupo_data['comunidades']:
                        grupo_data['comunidades'].append(comunidad_nombre)
                        print(f'OK Comunidad agregada a la lista: {comunidad_nombre}')
                else:
                    print(f'WARNING Cambio {cambio.id} NO tiene comunidad asociada (comunidad_id={comunidad_id})')
        except Exception as e:
            # Si hay un error al acceder a la comunidad, simplemente ignorar
            print(f'WARNING Error al acceder a comunidad del cambio {cambio.id}: {e}')

    cambios_data = []
    for grupo in cambios_por_grupo.values():
        evidencias_dict = grupo.pop('evidencias_dict', {})
        # Convertir el diccionario a lista y asegurar que no hay duplicados por ID
        evidencias_lista = list(evidencias_dict.values())
        # Verificar unicidad por ID (por seguridad adicional)
        evidencias_unicas = {}
        for evidencia in evidencias_lista:
            evidencia_id = evidencia.get('id') or str(evidencia.get('id', ''))
            if evidencia_id and evidencia_id not in evidencias_unicas:
                evidencias_unicas[evidencia_id] = evidencia
        grupo['evidencias'] = list(evidencias_unicas.values())
        grupo['responsables_display'] = ', '.join(grupo['responsables'])
        grupo['responsable'] = grupo['responsables_display']
        grupo['responsable_id'] = grupo['colaboradores_ids'][0] if grupo['colaboradores_ids'] else None
        # Convertir lista de comunidades a string separado por comas
        comunidades_lista = grupo['comunidades']
        print(f'SEARCH Grupo {grupo["grupo_id"]}: Lista de comunidades antes de convertir: {comunidades_lista}')
        grupo['comunidades'] = ', '.join(comunidades_lista) if comunidades_lista else ''
        print(f'SEARCH Grupo {grupo["grupo_id"]}: String de comunidades después de convertir: "{grupo["comunidades"]}"')
        print(f'ATTACH Grupo {grupo["grupo_id"]}: Total de evidencias en el grupo (antes de filtrado): {len(evidencias_lista)}, después de filtrado: {len(grupo["evidencias"])} (debe ser único por grupo)')
        cambios_data.append(grupo)
        print(f'OK Cambio agrupado agregado: {grupo["id"]} (grupo {grupo["grupo_id"]}) con {len(grupo["colaboradores_ids"])} colaborador(es) y {len(comunidades_lista)} comunidad(es) - String final: "{grupo["comunidades"]}"')

    cambios_data.sort(key=lambda item: item['fecha_cambio'] or '', reverse=True)
    print(f'BOX Total de cambios agrupados retornados: {len(cambios_data)} (de {cambios_total} totales)')
    # Retornar solo los primeros 50 grupos de cambios (más recientes)
    # Ya están ordenados por fecha_cambio descendente
    return cambios_data[:MAX_CAMBIOS_VISTA]


def obtener_portada_evento(evento):
    """Devuelve la información de la portada del evento, si existe."""
    portada = getattr(evento, 'portada', None)
    if not portada:
        return None
    return {
        'id': str(portada.id),
        'nombre': portada.archivo_nombre,
        'tipo': portada.archivo_tipo or '',
        'url': portada.url_almacenamiento,
    }


def eliminar_portada_evento(portada_inst):
    """Elimina la portada asociada al evento, incluyendo el archivo físico."""
    if not portada_inst:
        return False

    relative_path = (portada_inst.url_almacenamiento or '').strip()
    media_url = getattr(settings, 'MEDIA_URL', '') or ''
    posibles_prefijos = [media_url, '/media/', 'media/']
    for prefijo in posibles_prefijos:
        if prefijo and relative_path.startswith(prefijo):
            relative_path = relative_path[len(prefijo):]
            break
    relative_path = relative_path.lstrip('/')
    archivo_path = os.path.join(settings.MEDIA_ROOT, relative_path)

    if os.path.exists(archivo_path):
        try:
            os.remove(archivo_path)
        except Exception as error:
            print(f"WARNING No se pudo eliminar el archivo de portada: {error}")

    portada_inst.delete()
    return True


def obtener_url_portada_o_evidencia(evento):
    """Retorna la URL de la portada si existe; de lo contrario, la primera evidencia de imagen."""
    portada = obtener_portada_evento(evento)
    if portada and portada.get('url'):
        return portada['url']

    if hasattr(evento, 'evidencias'):
        evidencia = evento.evidencias.filter(es_imagen=True).first()
        if evidencia and evidencia.url_almacenamiento:
            return evidencia.url_almacenamiento
    return None


def guardar_portada_evento(actividad, archivo):
    if not archivo:
        return None

    content_type = getattr(archivo, 'content_type', '') or ''
    if not content_type.startswith('image/'):
        raise ValueError('El archivo de portada debe ser una imagen')

    portada_dir = os.path.join(settings.MEDIA_ROOT, 'eventos_portada_img')
    os.makedirs(portada_dir, exist_ok=True)
    fs = FileSystemStorage(location=portada_dir)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S%f')
    extension = os.path.splitext(archivo.name)[1]
    filename = f"{timestamp}{extension}"
    saved_name = fs.save(filename, archivo)
    url = f"/media/eventos_portada_img/{saved_name}"

    portada, _ = ActividadPortada.objects.update_or_create(
        actividad=actividad,
        defaults={
            'archivo_nombre': archivo.name,
            'archivo_tipo': content_type,
            'url_almacenamiento': url,
        },
    )
    return portada


__all__ = [
    'obtener_detalle_beneficiario',
    'aplicar_modificaciones_beneficiarios',
    'obtener_comunidades_evento',
    'obtener_tarjetas_datos',
    'obtener_cambios_evento',
    'obtener_portada_evento',
    'eliminar_portada_evento',
    'obtener_url_portada_o_evidencia',
    'guardar_portada_evento',
    '_calcular_tiempo_relativo',
    'normalizar_dpi',
    'buscar_conflicto_dpi',
]


def _calcular_tiempo_relativo(fecha):
    """Calcula tiempo relativo (ej: 'hace 2 horas')"""
    from django.utils import timezone
    from django.utils.timezone import localtime, is_aware, make_aware
    import pytz

    if not is_aware(fecha):
        fecha = make_aware(fecha, pytz.UTC)

    ahora = timezone.now()
    diferencia = ahora - fecha
    segundos = diferencia.total_seconds()

    if segundos < 0:
        return 'recién creado'

    if segundos < 60:
        return 'hace unos segundos'
    if segundos < 3600:
        minutos = int(segundos / 60)
        return f'hace {minutos} minuto{"s" if minutos != 1 else ""}'
    if segundos < 86400:
        horas = int(segundos / 3600)
        return f'hace {horas} hora{"s" if horas != 1 else ""}'
    if segundos < 604800:
        dias = int(segundos / 86400)
        return f'hace {dias} día{"s" if dias != 1 else ""}'

    fecha_local = localtime(fecha)
    return fecha_local.strftime('%d/%m/%Y %H:%M')

