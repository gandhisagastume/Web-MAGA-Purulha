from django.apps import AppConfig
import os
from django.conf import settings


class WebmagaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'webmaga'

    def ready(self):
        """Crea las carpetas de media necesarias si no existen"""
        self._crear_carpetas_media()

    @staticmethod
    def _crear_carpetas_media():
        """Crea todas las carpetas de media necesarias para el sistema"""
        # Lista de carpetas de media que deben existir
        carpetas_media = [
            'perfiles_img',
            'evidencias',
            'evidencias_cambios_eventos',
            'archivos_eventos',
            'eventos_portada_img',
            'galeria_img',
            'comunidades_galeria',
            'comunidades_archivos',
            'regiones_portada_img',
            'regiones_archivos',
        ]
        
        # Obtener la ruta base de media
        media_root = settings.MEDIA_ROOT
        
        # Crear la carpeta media principal si no existe
        os.makedirs(media_root, exist_ok=True)
        
        # Crear cada carpeta de media
        for carpeta in carpetas_media:
            carpeta_path = os.path.join(media_root, carpeta)
            try:
                os.makedirs(carpeta_path, exist_ok=True)
                print(f"OK Carpeta de media verificada/creada: {carpeta_path}")
            except Exception as e:
                print(f"ERROR al crear carpeta {carpeta_path}: {e}")
