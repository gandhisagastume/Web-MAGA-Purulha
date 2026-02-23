"""
Decoradores de Rate Limiting para APIs
Protege las APIs contra abuso y ataques DDoS
"""

from functools import wraps
from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited


def api_ratelimit(rate='30/m', method='ALL', key='ip', block=True):
    """
    Decorador de rate limiting para APIs con respuesta JSON
    
    Args:
        rate: Límite de peticiones (ej: '30/m' = 30 por minuto, '5/5m' = 5 cada 5 minutos)
        method: Métodos HTTP a limitar ('GET', 'POST', 'ALL', etc.)
        key: Qué usar para identificar al usuario ('ip', 'user', 'user_or_ip')
        block: Si True, bloquea peticiones excedidas. Si False, solo marca.
    
    Ejemplos de uso:
        @api_ratelimit(rate='30/m')  # 30 peticiones por minuto
        @api_ratelimit(rate='10/m', method='POST')  # 10 POST por minuto
        @api_ratelimit(rate='5/5m', key='user_or_ip')  # 5 cada 5 minutos
    """
    def decorator(view_func):
        @wraps(view_func)
        @ratelimit(key=key, rate=rate, method=method, block=block)
        def wrapped_view(request, *args, **kwargs):
            # Si se excedió el límite, retornar error JSON
            if getattr(request, 'limited', False):
                return JsonResponse({
                    'success': False,
                    'error': 'Demasiadas peticiones. Por favor, espera un momento e intenta de nuevo.',
                    'rate_limited': True
                }, status=429)
            
            return view_func(request, *args, **kwargs)
        
        return wrapped_view
    return decorator


def api_ratelimit_read(rate='30/m'):
    """
    Rate limiting para APIs de lectura (GET)
    Por defecto: 30 peticiones por minuto
    """
    return api_ratelimit(rate=rate, method='GET', key='user_or_ip')


def api_ratelimit_write(rate='10/m'):
    """
    Rate limiting para APIs de escritura (POST, PUT, DELETE)
    Por defecto: 10 peticiones por minuto
    """
    return api_ratelimit(rate=rate, method=['POST', 'PUT', 'DELETE', 'PATCH'], key='user_or_ip')


def api_ratelimit_auth(rate='5/5m'):
    """
    Rate limiting para endpoints de autenticación
    Por defecto: 5 intentos cada 5 minutos
    Más estricto para prevenir ataques de fuerza bruta
    """
    return api_ratelimit(rate=rate, method='POST', key='ip', block=True)


def api_ratelimit_upload(rate='5/m'):
    """
    Rate limiting para carga de archivos
    Por defecto: 5 peticiones por minuto
    Más estricto porque son operaciones pesadas
    """
    return api_ratelimit(rate=rate, method='POST', key='user_or_ip')


def api_ratelimit_strict(rate='5/m'):
    """
    Rate limiting estricto para operaciones sensibles
    Por defecto: 5 peticiones por minuto
    """
    return api_ratelimit(rate=rate, method='ALL', key='user_or_ip')


def api_ratelimit_bulk(rate='30/m'):
    """
    Rate limiting para operaciones masivas (importación de Excel, guardado masivo)
    Por defecto: 30 peticiones por minuto
    Más permisivo porque procesa múltiples registros en una sola petición
    """
    return api_ratelimit(rate=rate, method='POST', key='user_or_ip')


def api_ratelimit_login_smart(rate_per_user='10/3m', rate_per_ip='20/3m'):
    """
    Rate limiting inteligente para login:
    - 20 intentos por IP cada 3 minutos (permite múltiples usuarios en la misma red)
    - 10 intentos por usuario cada 3 minutos (protege cuentas específicas contra fuerza bruta)
    
    Esto permite que múltiples usuarios se logueen desde la misma oficina/red
    sin bloquearse entre sí, mientras mantiene protección contra ataques.
    
    IMPORTANTE: Usa block=False para que podamos devolver respuesta JSON personalizada
    en lugar del403 por defecto de django-ratelimit.
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(request, *args, **kwargs):
            import json
            from django_ratelimit.core import get_header
            
            # Obtener la IP del request
            ip = get_header(request, 'X-Forwarded-For')
            if ip:
                ip = ip.split(',')[0].strip()
            else:
                ip = request.META.get('REMOTE_ADDR', '0.0.0.0')
            
            # Verificar límite por IP usando cache directamente
            from django.core.cache import cache
            ip_cache_key = f'ratelimit:login_ip:{ip}'
            ip_count = cache.get(ip_cache_key, 0)
            
            if ip_count >= 20:  # 20 intentos por IP cada 3 minutos
                return JsonResponse({
                    'success': False,
                    'error': 'Demasiados intentos de login desde esta red. Por favor, espera un momento e intenta de nuevo.',
                    'rate_limited': True
                }, status=429)
            
            # Verificar límite por usuario
            try:
                data = json.loads(request.body)
                username = data.get('username', '').strip()
                
                if username:
                    user_cache_key = f'ratelimit:login_user:{username}'
                    user_count = cache.get(user_cache_key, 0)
                    
                    if user_count >= 10:  # 10 intentos por usuario cada 3 minutos
                        return JsonResponse({
                            'success': False,
                            'error': 'Demasiados intentos de login para este usuario. Por favor, espera un momento e intenta de nuevo.',
                            'rate_limited': True
                        }, status=429)
                    
                    # Incrementar contador de usuario
                    cache.set(user_cache_key, user_count + 1, 180)  # 3 minutos = 180 segundos
            except json.JSONDecodeError:
                pass
            except Exception as e:
                # Log del error pero no bloquear el login
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Error verificando rate limit por usuario: {e}")
            
            # Incrementar contador de IP
            cache.set(ip_cache_key, ip_count + 1, 180)  # 3 minutos = 180 segundos
            
            return view_func(request, *args, **kwargs)
        
        return wrapped_view
    return decorator


def api_ratelimit_password_reset(rate_per_user='5/5m'):
    """
    Rate limiting específico para recuperación de contraseña:
    - 5 intentos por usuario (email) cada 5 minutos
    
    Aplica tanto para:
    - Solicitud de códigos de verificación
    - Verificación de códigos ingresados
    
    Limita por email del usuario para prevenir spam de códigos.
    Si no hay email, aplica rate limiting por IP como fallback.
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(request, *args, **kwargs):
            import json
            
            # Extraer email del request body o POST
            email = None
            try:
                if request.body:
                    try:
                        data = json.loads(request.body.decode('utf-8'))
                    except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
                        data = json.loads(request.body) if isinstance(request.body, str) else {}
                else:
                    data = request.POST.dict() if hasattr(request, 'POST') else {}
                
                email = (data.get('email') or '').strip().lower()
            except (json.JSONDecodeError, KeyError, AttributeError, TypeError):
                pass
            
            # Aplicar rate limiting por email si está presente, sino por IP
            try:
                if email:
                    # Rate limiting por email (más específico)
                    def get_email_key(r):
                        return f'password_reset_user:{email}'
                    
                    @ratelimit(
                        key=get_email_key,
                        rate=rate_per_user,
                        method='POST',
                        block=True
                    )
                    def check_rate_limit_by_email(r):
                        return r
                    
                    limited_request = check_rate_limit_by_email(request)
                    
                    if getattr(limited_request, 'limited', False):
                        return JsonResponse({
                            'success': False,
                            'error': 'Has excedido el límite de intentos (5 intentos cada 5 minutos). Por favor, espera 5 minutos antes de intentar nuevamente.',
                            'rate_limited': True,
                            'retry_after': 300  # 5 minutos en segundos
                        }, status=429)
                else:
                    # Rate limiting por IP como fallback si no hay email
                    @ratelimit(
                        key='ip',
                        rate=rate_per_user,
                        method='POST',
                        block=True
                    )
                    def check_rate_limit_by_ip(r):
                        return r
                    
                    limited_request = check_rate_limit_by_ip(request)
                    
                    if getattr(limited_request, 'limited', False):
                        return JsonResponse({
                            'success': False,
                            'error': 'Has excedido el límite de intentos (5 intentos cada 5 minutos). Por favor, espera 5 minutos antes de intentar nuevamente.',
                            'rate_limited': True,
                            'retry_after': 300  # 5 minutos en segundos
                        }, status=429)
            except Exception as e:
                # Si hay error crítico en rate limiting, registrar pero permitir la petición
                # (mejor permitir una petición extra que bloquear completamente el servicio)
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f'Error en rate limiting de password reset: {str(e)}')
            
            return view_func(request, *args, **kwargs)
        
        return wrapped_view
    return decorator


# Manejador global de excepciones de rate limit
def handle_ratelimit_exception(request, exception):
    """
    Manejador personalizado para excepciones de rate limit
    Retorna una respuesta JSON amigable
    """
    return JsonResponse({
        'success': False,
        'error': 'Has excedido el límite de peticiones permitidas. Por favor, espera un momento e intenta de nuevo.',
        'rate_limited': True,
        'retry_after': getattr(exception, 'retry_after', 60)  # Segundos hasta poder reintentar
    }, status=429)

