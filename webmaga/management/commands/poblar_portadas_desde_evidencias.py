"""
Crea ActividadPortada para todas las actividades que no tengan portada asignada
pero que tengan al menos una Evidencia con es_imagen=True.

Esto resuelve el bug donde en la home de proyectos, las 'capacitaciones' (que
no ten\u00edan una portada expl\u00edcitamente asignada) no mostraban ninguna foto en
su miniatura aunque s\u00ed tuvieran im\u00e1genes en su galer\u00eda.

Uso:
    python manage.py poblar_portadas_desde_evidencias
    python manage.py poblar_portadas_desde_evidencias --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from webmaga.models import Actividad, ActividadPortada, Evidencia


class Command(BaseCommand):
    help = (
        'Crea ActividadPortada para actividades sin portada que tengan '
        'al menos una evidencia-imagen.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Muestra lo que se har\u00eda sin realizar cambios.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        verbosity = options.get('verbosity', 1)

        actividades = (
            Actividad.objects
            .filter(eliminado_en__isnull=True, portada__isnull=True)
            .prefetch_related('evidencias')
        )
        total = actividades.count()
        creadas = 0
        omitidas = 0
        errores = 0

        self.stdout.write(self.style.NOTICE(
            f'Encontradas {total} actividades sin portada.'
        ))

        for actividad in actividades.iterator():
            primera_imagen = (
                actividad.evidencias
                .filter(es_imagen=True)
                .exclude(url_almacenamiento__isnull=True)
                .exclude(url_almacenamiento='')
                .order_by('creado_en')
                .first()
            )

            if not primera_imagen or not primera_imagen.url_almacenamiento:
                omitidas += 1
                if verbosity >= 2:
                    self.stdout.write(self.style.WARNING(
                        f'  - Omitida (sin im\u00e1genes): {actividad.nombre} ({actividad.id})'
                    ))
                continue

            if verbosity >= 2:
                self.stdout.write(
                    f'  - Procesando: {actividad.nombre} ({actividad.id}) '
                    f'\u2192 {primera_imagen.archivo_nombre}'
                )

            if dry_run:
                creadas += 1
                continue

            try:
                with transaction.atomic():
                    ActividadPortada.objects.create(
                        actividad=actividad,
                        archivo_nombre=primera_imagen.archivo_nombre,
                        archivo_tipo=primera_imagen.archivo_tipo or '',
                        url_almacenamiento=primera_imagen.url_almacenamiento,
                    )
                creadas += 1
            except Exception as exc:
                errores += 1
                self.stdout.write(self.style.ERROR(
                    f'  \u2717 Error con {actividad.nombre} ({actividad.id}): {exc}'
                ))

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n[DRY-RUN] Se crear\u00edan {creadas} portadas. '
                f'Omitidas: {omitidas}. Errores: {errores}.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nListo. Portadas creadas: {creadas}. '
                f'Omitidas (sin imagen): {omitidas}. Errores: {errores}.'
            ))
