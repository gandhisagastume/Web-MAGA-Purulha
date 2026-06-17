/* ======= JAVASCRIPT PARA PROYECTOS.HTML ======= */

// NOTA: La funcionalidad de dropdowns, búsqueda y drawer está manejada por navigation.js

// Este archivo solo contiene la lógica específica de la página de proyectos

// ======= MANEJO DE ERRORES DE IMÁGENES OFFLINE =======
// Suprimir errores 503 en la consola para imágenes cuando está offline
window.addEventListener('error', function(event) {
  // Verificar si es un error de carga de imagen
  if (event.target && event.target.tagName === 'IMG') {
    // Si estamos offline y es un error 503, suprimirlo silenciosamente
    if (!navigator.onLine) {
      event.preventDefault();
      event.stopPropagation();
      // El onerror del img ya manejará el placeholder
      return false;
    }
  }
}, true);

// También manejar errores de recursos no cargados
window.addEventListener('unhandledrejection', function(event) {
  // Red de seguridad: si un rechazo de promesa no controlado deja un modal
  // abierto, cerrarlo para no bloquear la UI completa.
  if (typeof closeAllModals === 'function') {
    try { closeAllModals(); } catch (e) { /* noop */ }
  }
  // Suprimir errores de carga de imágenes cuando está offline
  if (!navigator.onLine && event.reason && typeof event.reason === 'object') {
    const message = event.reason.message || String(event.reason);
    if (message.includes('503') || message.includes('Failed to load resource')) {
      event.preventDefault();
      return false;
    }
  }
});

/* ---------- ANIMACIONES DE ENTRADA ---------- */

const observerOptions = {

  threshold: 0.1,

  rootMargin: '0px 0px -50px 0px'

};

const observer = new IntersectionObserver((entries) => {

  entries.forEach(entry => {

    if (entry.isIntersecting) {

      entry.target.style.opacity = '1';

      entry.target.style.transform = 'translateY(0)';

    }

  });

}, observerOptions);

// Observar elementos para animación

document.querySelectorAll('.project-card, .featured-card, .category-section').forEach(el => {

  el.style.opacity = '0';

  el.style.transform = 'translateY(30px)';

  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

  observer.observe(el);

});

// ======= FUNCIONES AUXILIARES =======

// Función para convertir archivo a base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1]; // Remover el prefijo data:type;base64,
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Función para convertir base64 a Blob (para mostrar archivos offline)
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// ======= DATOS DE PROYECTOS - CARGA DESDE BD =======

// Los datos se cargarán desde la API

let projectsData = {

  capacitaciones: [],

  entregas: [],

  "proyectos-ayuda": []

};

// Función para obtener referencia a IndexedDB (usa la instancia global)
function getOfflineDB() {
  return window.OfflineDB || null;
}

// Inicializar IndexedDB (solo asegurar que esté inicializado)
async function initOfflineDB() {
  if (window.OfflineDB) {
    try {
      await window.OfflineDB.init();
      console.log('✅ IndexedDB inicializado en proyectos.js');
      return true;
    } catch (error) {
      console.warn('⚠️ Error al inicializar IndexedDB:', error);
      return false;
    }
  }
  return false;
}

// Función para cargar proyectos desde la API o IndexedDB

async function cargarProyectosPorTipo(tipo) {
  console.log(`🔵 [cargarProyectosPorTipo] Iniciando carga para tipo: "${tipo}"`);
  
  try {
    // PRIMERO: Intentar cargar desde el servidor
    let proyectosDelServidor = null;
    
    try {
      console.log(`🟢 [cargarProyectosPorTipo] Intentando fetch para tipo: "${tipo}"`);
      let response;
      try {
        response = await fetch(`/api/proyectos/${tipo}/`);
        console.log(`🟢 [cargarProyectosPorTipo] Respuesta recibida - status: ${response.status}, ok: ${response.ok}`);
      } catch (fetchError) {
        // Si el fetch falla completamente (error de red), es offline
        console.log(`📴 Fetch falló completamente (error de red), cargando desde IndexedDB...`, fetchError.message);
        throw new Error('Network error - load from IndexedDB');
      }

      // Verificar si es un error offline esperado
      const isOfflineError = !navigator.onLine || 
        response.status === 503 ||
        (response.status === 503 && window.OfflineSync && window.OfflineSync.isOfflineError && window.OfflineSync.isOfflineError(response));

      console.log(`🟢 [cargarProyectosPorTipo] isOfflineError: ${isOfflineError}, navigator.onLine: ${navigator.onLine}, status: ${response.status}`);

      // Si es un error offline, saltar directamente al fallback de IndexedDB
      if (isOfflineError) {
        console.log(`📴 Error offline detectado (status: ${response.status}), cargando desde IndexedDB...`);
        throw new Error('Offline error - load from IndexedDB');
      }

      if (response.ok) {
        console.log(`🟢 [cargarProyectosPorTipo] Respuesta OK, parseando JSON...`);
        // Verificar Content-Type antes de parsear JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          // No es JSON, probablemente HTML (página de error o login), cargar desde IndexedDB
          console.log('📴 Respuesta no es JSON, cargando desde IndexedDB');
          throw new Error('Invalid content type - not JSON');
        }
        
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          // Si falla el parseo, probablemente es HTML, cargar desde IndexedDB
          console.log('📴 Error al parsear JSON, cargando desde IndexedDB');
          throw new Error('Invalid content type - not JSON');
        }
        
        // Verificar si la respuesta indica que es offline
        if (window.OfflineSync && window.OfflineSync.isOfflineResponse && window.OfflineSync.isOfflineResponse(data)) {
          // Es una respuesta offline, continuar para cargar desde IndexedDB
          console.log('📴 Respuesta offline detectada en data, cargando desde IndexedDB...');
        } else if (data.success && data.proyectos) {
          // Convertir el formato de la API al formato esperado por el frontend
          const proyectos = data.proyectos.map(proyecto => {
            // Extraer el nombre del tipo (puede venir como string o como objeto)
            let tipoNombre = tipo; // Por defecto usar el tipo solicitado
            if (proyecto.tipo) {
              if (typeof proyecto.tipo === 'string') {
                // Si es string, verificar que no sea un UUID
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(proyecto.tipo)) {
                  tipoNombre = proyecto.tipo; // Es un nombre, no un UUID
                }
              } else if (typeof proyecto.tipo === 'object' && proyecto.tipo.nombre) {
                tipoNombre = proyecto.tipo.nombre;
              }
            }
            
            return {
              id: proyecto.id,
              name: proyecto.nombre,
              location: proyecto.ubicacion,
              createdDate: proyecto.creado_en,
              modifiedDate: proyecto.actualizado_en,
              type: tipoNombre,
              categoryKey: tipo, // Guardar la clave de categoría para filtrado
              tipo: tipoNombre, // Guardar el nombre del tipo, no el ID
              estado: proyecto.estado,
              estado_display: proyecto.estado_display,
              descripcion: proyecto.descripcion,
              portada: proyecto.portada || null,
              imagen_principal: proyecto.imagen_principal,
              personal_count: proyecto.personal_count,
              personal_nombres: proyecto.personal_nombres,
              beneficiarios_count: proyecto.beneficiarios_count,
              evidencias_count: proyecto.evidencias_count,
              fecha: proyecto.fecha
            };
          });

          // Guardar en IndexedDB para uso offline (en segundo plano, no bloquea)
          const db = getOfflineDB();
          if (db) {
            // Usar Promise.all para guardar todos los proyectos en paralelo
            Promise.all(proyectos.map(async proyecto => {
              try {
                // Normalizar el tipo antes de guardar
                let tipoNormalizado = proyecto.type || proyecto.tipo || tipo;
                // Si el tipo viene como objeto, extraer el nombre
                if (tipoNormalizado && typeof tipoNormalizado === 'object' && tipoNormalizado.nombre) {
                  tipoNormalizado = tipoNormalizado.nombre;
                }
                tipoNormalizado = tipoNormalizado ? String(tipoNormalizado) : tipo;
                
                // Determinar categoryKey basado en el tipo normalizado
                let categoryKey = tipo; // Por defecto usar el tipo solicitado
                if (tipoNormalizado) {
                  const tipoLower = tipoNormalizado.toLowerCase();
                  if (tipoLower.includes('capacitación') || tipoLower.includes('capacitacion')) {
                    categoryKey = 'capacitaciones';
                  } else if (tipoLower.includes('entrega')) {
                    categoryKey = 'entregas';
                  } else if (tipoLower.includes('proyecto') || tipoLower.includes('ayuda')) {
                    categoryKey = 'proyectos-ayuda';
                  }
                }
                
                await db.saveProyecto({
                  ...proyecto,
                  tipo: tipoNormalizado,
                  categoryKey: categoryKey, // Guardar la clave de categoría determinada
                  ultimo_sync: new Date().toISOString(),
                });
              } catch (error) {
                // Silenciar errores de IndexedDB, no deben afectar la funcionalidad
                console.warn('Error al guardar proyecto en IndexedDB:', error);
              }
            })).catch(err => {
              console.warn('Error al guardar proyectos en IndexedDB:', err);
            });
          }

          proyectosDelServidor = proyectos;
          console.log(`✅ [cargarProyectosPorTipo] Proyectos cargados desde servidor para tipo "${tipo}": ${proyectos.length}`);
          
          // Si hay proyectos del servidor, retornarlos
          if (proyectos && proyectos.length > 0) {
            return proyectos;
          } else {
            // Si no hay proyectos del servidor, intentar IndexedDB como fallback
            console.log(`⚠️ No hay proyectos del servidor para tipo "${tipo}", intentando IndexedDB como fallback...`);
            // Continuar al bloque de IndexedDB
          }
        } else {
          // Si data.success es false o no hay proyectos, intentar IndexedDB como fallback
          console.log('⚠️ Respuesta del servidor indica error o sin proyectos (data.success = false o sin proyectos), intentando cargar desde IndexedDB...');
          console.log('⚠️ Data recibida:', data);
          // Continuar al bloque de IndexedDB en todos los casos
        }
      } else {
        // Error de respuesta (503, etc.), continuar para IndexedDB
        console.log(`⚠️ Error en respuesta del servidor (status: ${response.status}, ok: ${response.ok}), intentando cargar desde IndexedDB...`);
        // Lanzar error para que el catch maneje el fallback a IndexedDB
        throw new Error(`Server error ${response.status} - load from IndexedDB`);
      }
    } catch (error) {
      // Si es un error de red (offline), de Content-Type, o error del servidor, continuar para IndexedDB
      const isOfflineError = !navigator.onLine || 
        (error.name === 'TypeError' && error.message.includes('Failed to fetch')) ||
        (error.name === 'TypeError' && error.message.includes('NetworkError')) ||
        (error.message && error.message.includes('Invalid content type')) ||
        (error.message && error.message.includes('load from IndexedDB')) ||
        (error.message && error.message.includes('Offline error')) ||
        (error.message && error.message.includes('Network error'));
      
      if (isOfflineError) {
        console.log('📴 Error detectado, cargando desde IndexedDB...', error.message);
      } else {
        console.warn('⚠️ Error al cargar desde servidor:', error);
        console.log('📴 Intentando cargar desde IndexedDB como fallback...');
      }
      // Continuar al bloque de IndexedDB en todos los casos
    }

    // FALLBACK: Si no hay conexión o falló el servidor, SIEMPRE intentar cargar desde IndexedDB
    console.log(`🟡 [cargarProyectosPorTipo] Llegó al bloque de IndexedDB para tipo: "${tipo}"`);
    const db = getOfflineDB();
    console.log(`🟡 [cargarProyectosPorTipo] getOfflineDB() retornó:`, db ? 'IndexedDB disponible' : 'null/undefined');
    if (db) {
      try {
        console.log(`📴 Modo offline: Cargando proyectos de tipo "${tipo}" desde IndexedDB`);
        
        // Primero verificar cuántos proyectos hay en total en IndexedDB
        const todosLosProyectos = await db.getAllProyectos();
        console.log(`📦 Total de proyectos en IndexedDB:`, todosLosProyectos?.length || 0);
        
        if (todosLosProyectos && todosLosProyectos.length > 0) {
          // Mostrar información de los primeros proyectos para debugging
          console.log(`🔍 Primeros 3 proyectos en IndexedDB:`, todosLosProyectos.slice(0, 3).map(p => ({
            id: p.id,
            nombre: p.nombre || p.name,
            tipo: p.tipo || 'N/A',
            type: p.type || 'N/A',
            categoryKey: p.categoryKey || 'N/A',
            category: p.category || 'N/A',
            tieneTipo: !!(p.tipo || p.type || p.categoryKey || p.category)
          })));
          
          // Mostrar todos los tipos únicos encontrados
          const tiposUnicos = [...new Set(todosLosProyectos.map(p => 
            p.tipo || p.type || p.categoryKey || p.category || 'sin-tipo'
          ))];
          console.log(`🔍 Todos los tipos únicos en IndexedDB:`, tiposUnicos);
          
          // Si hay proyectos sin tipo, intentar actualizarlos desde el servidor cuando haya conexión
          const proyectosSinTipo = todosLosProyectos.filter(p => !(p.tipo || p.type || p.categoryKey || p.category));
          if (proyectosSinTipo.length > 0 && navigator.onLine) {
            console.log(`⚠️ Hay ${proyectosSinTipo.length} proyectos sin tipo. Se actualizarán en la próxima sincronización.`);
          }
        }
        
        const proyectosOffline = await db.getAllProyectos(tipo);
        console.log(`📊 Proyectos encontrados en IndexedDB para tipo "${tipo}":`, proyectosOffline?.length || 0);
        
        if (proyectosOffline && proyectosOffline.length > 0) {
          const proyectosMapeados = proyectosOffline.map(p => {
            // Si el proyecto no tiene categoryKey, intentar inferirlo del tipo
            let categoryKey = p.categoryKey || tipo;
            if (!p.categoryKey && (p.tipo || p.type)) {
              const tipoProyecto = String(p.tipo || p.type).toLowerCase();
              if (tipoProyecto.includes('capacitación') || tipoProyecto.includes('capacitacion')) {
                categoryKey = 'capacitaciones';
              } else if (tipoProyecto.includes('entrega')) {
                categoryKey = 'entregas';
              } else if (tipoProyecto.includes('proyecto') || tipoProyecto.includes('ayuda')) {
                categoryKey = 'proyectos-ayuda';
              }
            }
            
            return {
              id: p.id,
              name: p.name || p.nombre,
              location: p.location || p.ubicacion,
              createdDate: p.createdDate || p.creado_en || p.fecha,
              modifiedDate: p.modifiedDate || p.actualizado_en,
              type: p.type || p.tipo || categoryKey || p.category,
              categoryKey: categoryKey,
              estado: p.estado,
              estado_display: p.estado_display,
              descripcion: p.descripcion,
              portada: p.portada || null,
              imagen_principal: p.imagen_principal,
              personal_count: p.personal_count,
              personal_nombres: p.personal_nombres,
              beneficiarios_count: p.beneficiarios_count,
              evidencias_count: p.evidencias_count,
              fecha: p.fecha || p.createdDate || p.creado_en
            };
          });
          console.log(`✅ ${proyectosMapeados.length} proyectos cargados desde IndexedDB para tipo "${tipo}"`);
          return proyectosMapeados;
        } else {
          console.log(`⚠️ No se encontraron proyectos de tipo "${tipo}" en IndexedDB`);
          // Si no hay proyectos del tipo específico, mostrar qué tipos hay disponibles
          if (todosLosProyectos && todosLosProyectos.length > 0) {
            const tiposEncontrados = [...new Set(todosLosProyectos.map(p => 
              p.tipo || p.type || p.categoryKey || p.category || 'sin-tipo'
            ))];
            console.log(`ℹ️ Tipos de proyectos encontrados en IndexedDB:`, tiposEncontrados);
            
            // NO mostrar todos los proyectos como fallback
            // Si no hay proyectos del tipo solicitado, retornar array vacío
            console.log(`ℹ️ No hay proyectos de tipo "${tipo}" en IndexedDB. Tipos disponibles: ${tiposEncontrados.join(', ')}`);
            console.log(`💡 Los proyectos se categorizarán automáticamente cuando se sincronicen o se editen.`);
          }
        }
      } catch (error) {
        console.error('❌ Error al cargar desde IndexedDB:', error);
        console.error('❌ Stack trace:', error.stack);
        return [];
      }
    } else {
      console.warn('⚠️ IndexedDB no está disponible');
      return [];
    }

  } catch (error) {

    console.error('❌ Error al cargar proyectos:', error);
    return [];

  }

}

// Función para cargar los últimos proyectos

async function cargarUltimosProyectos() {

  try {
    // Usar fetch (que está interceptado por offlineAwareFetch)
    const response = await fetch('/api/ultimos-proyectos/');

    // Verificar si es un error offline esperado
    const isOfflineError = !navigator.onLine || 
      (response.status === 503 && window.OfflineSync && window.OfflineSync.isOfflineError && window.OfflineSync.isOfflineError(response));

    if (response.ok) {
      // Verificar Content-Type antes de parsear
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // No es JSON, probablemente HTML (página de error o login), cargar desde IndexedDB
        console.log('📴 Respuesta no es JSON en cargarUltimosProyectos, cargando desde IndexedDB');
        throw new Error('Invalid content type - not JSON');
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        // Si falla el parseo, probablemente es HTML, cargar desde IndexedDB
        console.log('📴 Error al parsear JSON en cargarUltimosProyectos, cargando desde IndexedDB');
        throw new Error('Invalid content type - not JSON');
      }
      
      // Verificar si la respuesta indica que es offline
      if (window.OfflineSync && window.OfflineSync.isOfflineResponse && window.OfflineSync.isOfflineResponse(data)) {
        // Es una respuesta offline, intentar cargar desde IndexedDB
        const db = getOfflineDB();
        if (db) {
          try {
            console.log('📴 Respuesta offline detectada, cargando últimos proyectos desde IndexedDB');
            const proyectosOffline = await db.getAllProyectos();
            if (proyectosOffline && proyectosOffline.length > 0) {
              // Ordenar por fecha de creación (más recientes primero) y tomar los primeros 10
              const proyectosOrdenados = proyectosOffline
                .sort((a, b) => {
                  const fechaA = new Date(a.createdDate || a.fecha || 0);
                  const fechaB = new Date(b.createdDate || b.fecha || 0);
                  return fechaB - fechaA;
                })
                .slice(0, 10);
              return proyectosOrdenados;
            }
          } catch (dbError) {
            console.warn('⚠️ Error al cargar últimos proyectos desde IndexedDB:', dbError);
          }
        }
        return [];
      }

      if (data.success) {
        return data.proyectos || [];
      } else {
        return [];
      }
    } else if (isOfflineError) {
      // Error offline esperado, intentar cargar desde IndexedDB
      const db = getOfflineDB();
      if (db) {
        try {
          console.log('📴 Modo offline: Cargando últimos proyectos desde IndexedDB');
          const proyectosOffline = await db.getAllProyectos();
          if (proyectosOffline && proyectosOffline.length > 0) {
            // Normalizar y ordenar por fecha de creación (más recientes primero) y tomar los primeros 10
            const proyectosNormalizados = proyectosOffline.map(p => ({
              id: p.id,
              name: p.name || p.nombre,
              location: p.location || p.ubicacion,
              createdDate: p.createdDate || p.creado_en || p.fecha,
              modifiedDate: p.modifiedDate || p.actualizado_en,
              type: p.type || p.tipo || p.categoryKey || p.category,
              categoryKey: p.categoryKey || p.tipo || p.type || p.category,
              estado: p.estado,
              estado_display: p.estado_display,
              descripcion: p.descripcion,
              portada: p.portada || null,
              imagen_principal: p.imagen_principal,
              personal_count: p.personal_count,
              personal_nombres: p.personal_nombres,
              beneficiarios_count: p.beneficiarios_count,
              evidencias_count: p.evidencias_count,
              fecha: p.fecha || p.createdDate || p.creado_en
            }));
            const proyectosOrdenados = proyectosNormalizados
              .sort((a, b) => {
                const fechaA = new Date(a.createdDate || a.fecha || 0);
                const fechaB = new Date(b.createdDate || b.fecha || 0);
                return fechaB - fechaA;
              })
              .slice(0, 10);
            console.log(`✅ ${proyectosOrdenados.length} últimos proyectos cargados desde IndexedDB`);
            return proyectosOrdenados;
          }
        } catch (dbError) {
          console.warn('⚠️ Error al cargar últimos proyectos desde IndexedDB:', dbError);
        }
      }
      return [];
    } else {
      // Error real del servidor, retornar vacío
      return [];
    }

  } catch (error) {
    // Si es un error de red (offline) o de Content-Type (HTML en lugar de JSON), intentar cargar desde IndexedDB
    const isOfflineError = !navigator.onLine || 
      (error.name === 'TypeError' && error.message.includes('Failed to fetch')) ||
      (error.message && error.message.includes('Invalid content type'));
    
    if (isOfflineError) {
      // Intentar cargar desde IndexedDB
      const db = getOfflineDB();
      if (db) {
        try {
          console.log('📴 Modo offline: Cargando últimos proyectos desde IndexedDB');
          const proyectosOffline = await db.getAllProyectos();
          if (proyectosOffline && proyectosOffline.length > 0) {
            // Normalizar y ordenar por fecha de creación (más recientes primero) y tomar los primeros 10
            const proyectosNormalizados = proyectosOffline.map(p => ({
              id: p.id,
              name: p.name || p.nombre,
              location: p.location || p.ubicacion,
              createdDate: p.createdDate || p.creado_en || p.fecha,
              modifiedDate: p.modifiedDate || p.actualizado_en,
              type: p.type || p.tipo || p.categoryKey || p.category,
              categoryKey: p.categoryKey || p.tipo || p.type || p.category,
              estado: p.estado,
              estado_display: p.estado_display,
              descripcion: p.descripcion,
              portada: p.portada || null,
              imagen_principal: p.imagen_principal,
              personal_count: p.personal_count,
              personal_nombres: p.personal_nombres,
              beneficiarios_count: p.beneficiarios_count,
              evidencias_count: p.evidencias_count,
              fecha: p.fecha || p.createdDate || p.creado_en
            }));
            const proyectosOrdenados = proyectosNormalizados
              .sort((a, b) => {
                const fechaA = new Date(a.createdDate || a.fecha || 0);
                const fechaB = new Date(b.createdDate || b.fecha || 0);
                return fechaB - fechaA;
              })
              .slice(0, 10);
            console.log(`✅ ${proyectosOrdenados.length} últimos proyectos cargados desde IndexedDB`);
            return proyectosOrdenados;
          }
        } catch (dbError) {
          console.warn('⚠️ Error al cargar últimos proyectos desde IndexedDB:', dbError);
        }
      }
      return [];
    }
    // Otro tipo de error, retornar vacío
    return [];
  }

}

// Función para inicializar la carga de todos los tipos de proyectos

async function inicializarProyectos() {

  try {
    console.log('🚀 Inicializando proyectos...');
    console.log('🔍 Estado de conexión:', navigator.onLine ? 'Online' : 'Offline');
    console.log('🔍 IndexedDB disponible:', window.OfflineDB ? 'Sí' : 'No');

    // Cargar todos los tipos de proyectos y los últimos en paralelo
    console.log('🔄 Iniciando carga de proyectos en paralelo...');

    const [capacitaciones, entregas, proyectosAyuda, ultimosProyectos] = await Promise.all([

      cargarProyectosPorTipo('capacitaciones').catch(err => {
        console.error('❌ Error al cargar capacitaciones:', err);
        return [];
      }),

      cargarProyectosPorTipo('entregas').catch(err => {
        console.error('❌ Error al cargar entregas:', err);
        return [];
      }),

      cargarProyectosPorTipo('proyectos-ayuda').catch(err => {
        console.error('❌ Error al cargar proyectos-ayuda:', err);
        return [];
      }),

      cargarUltimosProyectos().catch(err => {
        console.error('❌ Error al cargar últimos proyectos:', err);
        return [];
      })

    ]);

    console.log('📊 Proyectos cargados:', {
      capacitaciones: capacitaciones?.length || 0,
      entregas: entregas?.length || 0,
      proyectosAyuda: proyectosAyuda?.length || 0,
      ultimosProyectos: ultimosProyectos?.length || 0
    });

    // Actualizar projectsData con los resultados

    projectsData.capacitaciones = capacitaciones || [];

    projectsData.entregas = entregas || [];

    projectsData['proyectos-ayuda'] = proyectosAyuda || [];

    // Renderizar proyectos en el HTML

    renderizarProyectosEnHTML();

    // Renderizar últimos proyectos

    renderizarUltimosProyectos(ultimosProyectos || []);

    // Verificar si hay un hash en la URL para abrir un evento específico

    verificarHashYAbrirEvento();

  } catch (error) {
    console.error('❌ Error al inicializar proyectos:', error);
    // Intentar renderizar con datos vacíos para que la UI no se quede en blanco
    renderizarProyectosEnHTML();
    renderizarUltimosProyectos([]);
  }

}

// Exponer función globalmente para que pueda ser llamada desde otras páginas
if (typeof window !== 'undefined') {
  window.inicializarProyectos = inicializarProyectos;
}

// Función para verificar el hash de la URL y abrir el evento correspondiente

function verificarHashYAbrirEvento() {

  const hash = window.location.hash;

  if (hash && hash.startsWith('#evento-')) {

    const eventoId = hash.replace('#evento-', '');

    // Esperar un poco para que los proyectos se rendericen

    setTimeout(() => {

      loadProjectDetails(eventoId);

    }, 500);

  }

}

// Llamar a la función de inicialización cuando el DOM esté listo

if (document.readyState === 'loading') {

  document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar IndexedDB en segundo plano, no bloquear la carga
    initOfflineDB().catch(err => console.warn('IndexedDB no disponible:', err));
    inicializarProyectos();
    
    // Listener para actualizar proyectos cuando se sincronizan cambios
    document.addEventListener('OfflineSync:sent', async (event) => {
      const item = event.detail;
      if (!item || !item.url) return;
      
      // Manejar sincronización de imágenes
      if (item.url.includes('/galeria/agregar/')) {
        // Extraer el ID del proyecto de la URL
        const match = item.url.match(/\/evento\/([^/]+)\/galeria\/agregar/);
        if (match && match[1]) {
          const proyectoId = match[1];
          console.log('🔄 Imagen sincronizada para proyecto:', proyectoId);
          
          // Recargar el proyecto desde el servidor para obtener la imagen con su ID real
          try {
            const db = getOfflineDB();
            if (db) {
              const response = await fetch(`/api/proyecto/${proyectoId}/`);
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.proyecto) {
                  // Actualizar el proyecto en IndexedDB
                  await db.saveProyecto(data.proyecto);
                  console.log('✅ Proyecto actualizado en IndexedDB después de sincronizar imagen');
                  
                  // Si estamos viendo este proyecto, actualizar la vista
                  if (currentProjectId === proyectoId) {
                    await refreshCurrentProject();
                  }
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Error al actualizar proyecto después de sincronizar imagen:', error);
          }
        }
      }
      
      // Manejar sincronización de creación de eventos/proyectos
      if (item.url.includes('/evento/crear/')) {
        console.log('🔄 Evento/proyecto sincronizado, actualizando...');
        
        try {
          const db = getOfflineDB();
          const responseData = item.response;
          
          // Si la respuesta incluye el ID del evento creado, actualizar en IndexedDB
          if (responseData && responseData.success && (responseData.id || responseData.evento_id)) {
            const eventoIdReal = responseData.id || responseData.evento_id;
            console.log('🔄 Evento creado con ID real:', eventoIdReal);
            
            // Buscar el evento temporal en IndexedDB y actualizarlo con el ID real
            if (db) {
              try {
                // Obtener todos los proyectos offline
                const proyectosOffline = await db.getAllProyectos();
                // Buscar el proyecto temporal por el ID de la cola o por ser el más reciente offline
                const proyectoTemporal = proyectosOffline.find(p => {
                  if (!p.id || !p.is_offline) return false;
                  // Buscar por offline_queue_id si existe
                  if (p.offline_queue_id && p.offline_queue_id === item.id) {
                    return true;
                  }
                  // Si no tiene offline_queue_id, buscar por ID temporal (offline_)
                  if (p.id.startsWith('offline_') && !p.offline_queue_id) {
                    // Verificar si es el más reciente (creado en los últimos 5 minutos)
                    const createdTime = p.created_at ? new Date(p.created_at).getTime() : 0;
                    const now = Date.now();
                    return (now - createdTime) < 5 * 60 * 1000; // 5 minutos
                  }
                  return false;
                });
                
                if (proyectoTemporal) {
                  console.log('🔄 Proyecto temporal encontrado:', proyectoTemporal.id, 'actualizando con ID real:', eventoIdReal);
                  
                  // Recargar el proyecto completo desde el servidor con el ID real
                  const response = await fetch(`/api/proyecto/${eventoIdReal}/`);
                  if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.proyecto) {
                      // Eliminar el proyecto temporal
                      try {
                        await db.delete('proyectos', proyectoTemporal.id);
                        console.log('✅ Proyecto temporal eliminado:', proyectoTemporal.id);
                      } catch (deleteError) {
                        console.warn('⚠️ Error al eliminar proyecto temporal:', deleteError);
                      }
                      
                      // Guardar el proyecto real
                      await db.saveProyecto(data.proyecto);
                      console.log('✅ Proyecto actualizado en IndexedDB con ID real:', eventoIdReal);
                    }
                  } else {
                    console.warn('⚠️ No se pudo cargar el proyecto desde el servidor:', response.status);
                  }
                } else {
                  console.log('ℹ️ No se encontró proyecto temporal para actualizar');
                }
              } catch (error) {
                console.warn('⚠️ Error al actualizar proyecto temporal:', error);
              }
            }
          }
          
          // Esperar un momento para que el servidor procese la creación
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Sincronizar desde el servidor para actualizar IndexedDB con el nuevo proyecto
          if (window.OfflineSync && typeof window.OfflineSync.syncFromServer === 'function') {
            try {
              await window.OfflineSync.syncFromServer();
              console.log('✅ Datos sincronizados desde servidor después de crear proyecto');
            } catch (error) {
              console.warn('⚠️ Error al sincronizar desde servidor:', error);
            }
          }
          
          // Recargar la lista de proyectos desde el servidor
          if (typeof cargarProyectosPorTipo === 'function') {
            // Recargar todas las categorías
            try {
              await Promise.all([
                cargarProyectosPorTipo('capacitaciones'),
                cargarProyectosPorTipo('entregas'),
                cargarProyectosPorTipo('proyectos-ayuda')
              ]);
              console.log('✅ Proyectos recargados después de sincronizar creación');
            } catch (error) {
              console.warn('⚠️ Error al recargar proyectos:', error);
            }
          }
          
          // También recargar últimos proyectos si la función existe
          if (typeof cargarUltimosProyectos === 'function') {
            try {
              await cargarUltimosProyectos();
              console.log('✅ Últimos proyectos recargados');
            } catch (error) {
              console.warn('⚠️ Error al recargar últimos proyectos:', error);
            }
          }
        } catch (error) {
          console.warn('⚠️ Error al recargar proyectos después de sincronizar creación:', error);
        }
      }
    });
  });

} else {

  // Inicializar IndexedDB en segundo plano, no bloquear la carga
  initOfflineDB().catch(err => console.warn('IndexedDB no disponible:', err));
  inicializarProyectos();

}

// Función para formatear fechas

function formatDate(dateString) {
  const formatter = new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (!dateString) {
    return formatter.format(new Date());
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return formatter.format(new Date());
  }

  return formatter.format(date);
}

// Función para parsear fechas YYYY-MM-DD como fecha LOCAL (evita desfase UTC)
function parseLocalDate(dateString) {
  if (!dateString) {
    return new Date();
  }
  // Si viene como ISO completo con zona horaria, usarlo directamente
  if (dateString.includes('T') || dateString.includes(' ')) {
    const parsed = new Date(dateString);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  // Para formato YYYY-MM-DD, crear fecha local año, mes-1, día
  const parts = String(dateString).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(year, month - 1, day);
    }
  }
  return new Date();
}

// Función para renderizar proyectos en el HTML

function renderizarProyectosEnHTML() {

  // Renderizar capacitaciones

  renderizarCategoria('capacitaciones', projectsData.capacitaciones);

  // Renderizar entregas

  renderizarCategoria('entregas', projectsData.entregas);

  // Renderizar proyectos de ayuda

  renderizarCategoria('proyectos-ayuda', projectsData['proyectos-ayuda']);

}

// Función para renderizar una categoría específica

function renderizarCategoria(categoriaId, proyectos) {

  const seccionCategoria = document.getElementById(categoriaId);

  if (!seccionCategoria) {

    return;

  }

  const gridContainer = seccionCategoria.querySelector('.projects-grid');

  if (!gridContainer) {

    return;

  }

  // Limpiar contenido existente

  gridContainer.innerHTML = '';

  // Si no hay proyectos, mostrar mensaje

  if (!proyectos || proyectos.length === 0) {

    gridContainer.innerHTML = `

      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6c757d;">

        <p>No hay proyectos de este tipo aún.</p>

      </div>

    `;

    return;

  }

  // Mostrar solo los primeros 3 proyectos

  const proyectosMostrar = proyectos.slice(0, 3);

  proyectosMostrar.forEach(proyecto => {
    // Debug: Verificar datos del proyecto antes de crear la tarjeta
    if (proyecto && (!proyecto.portada || !proyecto.imagen_principal)) {
      console.log(`🔍 [${categoriaId}] Proyecto sin imagen:`, {
        id: proyecto.id,
        nombre: proyecto.nombre || proyecto.name,
        portada: proyecto.portada,
        imagen_principal: proyecto.imagen_principal
      });
    }
    
    const projectCard = crearTarjetaProyecto(proyecto);

    gridContainer.appendChild(projectCard);

  });

}

// Función para crear una tarjeta de proyecto

function crearTarjetaProyecto(proyecto) {

  const card = document.createElement('div');

  card.className = 'project-card';

  // Extraer mes, día y año de la fecha (parseo local para evitar desfase UTC)
  // Priorizar las fechas reales de auditoría (creado_en / actualizado_en) sobre
  // la fecha planeada del proyecto, que a veces está mal digitada.
  const fecha = parseLocalDate(
    proyecto.actualizado_en ||
    proyecto.modifiedDate ||
    proyecto.creado_en ||
    proyecto.createdDate ||
    proyecto.fecha
  );

  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const mes = meses[fecha.getMonth()];

  const dia = fecha.getDate();

  const anio = fecha.getFullYear();

  // Placeholder SVG sin comillas simples para no romper el onerror
  const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect width=%22100%%22 height=%22100%%22 fill=%22%231d2531%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23b8c5d1%22 font-family=Arial font-size=16>Sin imagen</text></svg>";

  // Manejar diferentes formatos de portada (igual que en crearTarjetaProyectoDestacado)
  let imagenUrl = null;
  if (proyecto.portada) {
    if (typeof proyecto.portada === 'string') {
      imagenUrl = proyecto.portada;
    } else if (proyecto.portada && typeof proyecto.portada === 'object' && proyecto.portada.url) {
      imagenUrl = proyecto.portada.url;
    }
  }

  if (!imagenUrl) {
    imagenUrl = proyecto.imagen_principal || null;
  }

  // Si no hay imagen, usar placeholder
  if (!imagenUrl) {
    imagenUrl = placeholderSvg;
  }

  card.innerHTML = `

    <div class="project-image">

      <img src="${imagenUrl}" alt="${proyecto.nombre || proyecto.name}" loading="lazy" onerror="this.onerror=null; this.src='${placeholderSvg}'">

      <div class="project-date-overlay">

        <div class="date__month">${mes}</div>

        <div class="date__day">${dia}</div>

        <div class="date__year">${anio}</div>

      </div>

      <div class="project-content-overlay">

        <h4 class="project-title">${proyecto.nombre || proyecto.name}</h4>

        <p class="project-location">${proyecto.ubicacion || proyecto.location}</p>

        <button class="project-btn" data-project-id="${proyecto.id}">Ver más ></button>

      </div>

    </div>

  `;

  // Agregar evento click al botón

  const btn = card.querySelector('.project-btn');

  btn.addEventListener('click', function() {

    const projectId = this.getAttribute('data-project-id');

    loadProjectDetails(projectId);

  });

  return card;

}

// Función para renderizar los últimos proyectos

function renderizarUltimosProyectos(proyectos) {

  featuredProjectsData = Array.isArray(proyectos)
    ? proyectos.map(normalizeProjectForFeatured).filter(Boolean)
    : [];

  if (featuredProjectsData.length > 1) {
    const uniqueProjects = [];
    const seenIds = new Set();
    featuredProjectsData.forEach((project) => {
      if (!seenIds.has(project.id)) {
        seenIds.add(project.id);
        uniqueProjects.push(project);
      }
    });
    featuredProjectsData = uniqueProjects;
  }

  renderFeaturedProjectsGrid();

}

function renderFeaturedProjectsGrid() {
  const featuredGrid = document.querySelector('.latest-projects .projects-grid.featured');

  if (!featuredGrid) {
    return;
  }

  featuredGrid.innerHTML = '';

  if (!featuredProjectsData.length) {
    featuredGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6c757d;">
        <p>No hay proyectos recientes aún.</p>
      </div>
    `;
    return;
  }

  const projectsToRender = featuredProjectsData.slice(0, FEATURED_PROJECTS_LIMIT);

  projectsToRender.forEach((proyecto, index) => {
    try {
      const card = crearTarjetaProyectoDestacado(proyecto);
      if (!card) {
        return;
      }

      const imagenDestacada =
        (proyecto.portada && proyecto.portada.url) ||
        proyecto.imagen_principal ||
        null;

      const imgTag = card.querySelector('img');
      if (imgTag) {
        imgTag.loading = 'lazy';
        const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%231d2531'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23b8c5d1' font-family='Arial' font-size='16'>Sin imagen</text></svg>";
        if (imagenDestacada) {
          imgTag.src = imagenDestacada;
          imgTag.onerror = function() {
            this.onerror = null;
            this.src = placeholderSvg;
          };
        } else {
          imgTag.src = placeholderSvg;
        }
      }

      featuredGrid.appendChild(card);
    } catch (error) {
    }
  });

}

function normalizeProjectForFeatured(proyecto) {
  if (!proyecto) {
    return null;
  }

  const projectId = proyecto.id || proyecto.uuid || proyecto.pk;
  if (!projectId) {
    return null;
  }

  const nombre = proyecto.nombre || proyecto.name || 'Sin nombre';

  let ubicacion = proyecto.ubicacion || proyecto.location || '';
  if (!ubicacion) {
    const comunidadNombre =
      (proyecto.comunidad && (proyecto.comunidad.nombre || proyecto.comunidad.name)) ||
      proyecto.comunidad_nombre ||
      proyecto.community_name ||
      '';
    const regionNombre =
      (proyecto.comunidad &&
        proyecto.comunidad.region &&
        (proyecto.comunidad.region.nombre || proyecto.comunidad.region.name)) ||
      proyecto.region_nombre ||
      proyecto.region ||
      '';
    if (comunidadNombre && regionNombre) {
      ubicacion = `${comunidadNombre}, ${regionNombre}`;
    } else if (comunidadNombre) {
      ubicacion = comunidadNombre;
    } else if (regionNombre) {
      ubicacion = regionNombre;
    }
  }

  const fecha =
    proyecto.actualizado_en ||
    proyecto.modifiedDate ||
    proyecto.creado_en ||
    proyecto.createdDate ||
    proyecto.fecha ||
    proyecto.fecha_evento ||
    proyecto.fecha_inicio ||
    '';

  const fechaDisplay =
    proyecto.fecha_display ||
    proyecto.fecha_formatted ||
    proyecto.fecha_formateada ||
    proyecto.fecha_formato ||
    proyecto.actualizado_en_formatted ||
    proyecto.creado_en_formatted ||
    fecha;

  let portada = null;
  const portadaFuente = proyecto.portada || proyecto.portada_url || proyecto.coverImage;
  if (typeof portadaFuente === 'string') {
    portada = { url: portadaFuente };
  } else if (portadaFuente && typeof portadaFuente === 'object') {
    const portadaUrl =
      portadaFuente.url ||
      portadaFuente.imagen_url ||
      portadaFuente.image_url ||
      portadaFuente.archivo_url ||
      portadaFuente.path ||
      null;
    if (portadaUrl) {
      portada = { url: portadaUrl };
    }
  }

  let imagenPrincipal = proyecto.imagen_principal || proyecto.imagenPrincipal || null;
  if (!imagenPrincipal && portada && portada.url) {
    imagenPrincipal = portada.url;
  }

  if (!imagenPrincipal && Array.isArray(proyecto.evidencias)) {
    const primeraGaleria = proyecto.evidencias.find((item) => item && item.es_galeria === true && (item.url || item.url_almacenamiento || item.imagen_url));
    const primeraImagen = primeraGaleria || proyecto.evidencias.find((item) => {
      if (!item || item.es_galeria === false) {
        if (!item || !item.es_imagen) return false;
        return Boolean(item.url || item.url_almacenamiento || item.imagen_url);
      }
      if (item.es_imagen === false) return false;
      const tipoArchivo = item.archivo_tipo || item.tipo;
      if (tipoArchivo && typeof tipoArchivo === 'string') {
        return tipoArchivo.startsWith('image/');
      }
      return Boolean(item.url || item.url_almacenamiento || item.imagen_url);
    });

    if (primeraImagen) {
      imagenPrincipal =
        primeraImagen.url ||
        primeraImagen.url_almacenamiento ||
        primeraImagen.imagen_url ||
        primeraImagen.archivo_url ||
        null;
    }
  }

  return {
    ...proyecto,
    id: String(projectId),
    nombre,
    ubicacion: ubicacion || 'Sin ubicación',
    fecha,
    fecha_display: fechaDisplay || fecha,
    imagen_principal: imagenPrincipal,
    portada,
  };
}

function promoteProjectToFeatured(proyecto) {
  const normalized = normalizeProjectForFeatured(proyecto);
  if (!normalized) {
    return;
  }

  featuredProjectsData = featuredProjectsData.filter((item) => item.id !== normalized.id);
  featuredProjectsData.unshift(normalized);

  if (FEATURED_PROJECTS_LIMIT && featuredProjectsData.length > FEATURED_PROJECTS_LIMIT) {
    featuredProjectsData = featuredProjectsData.slice(0, FEATURED_PROJECTS_LIMIT);
  }

  renderFeaturedProjectsGrid();
}

async function refreshLatestProjectsFromServer() {
  try {
    const ultimosProyectos = await cargarUltimosProyectos();
    renderizarUltimosProyectos(ultimosProyectos);
  } catch (error) {
  }
}
// Función para crear una tarjeta de proyecto destacado

function crearTarjetaProyectoDestacado(proyecto) {

  if (!proyecto) {

    return null;

  }

  const card = document.createElement('div');

  card.className = 'project-card featured-card';

  // Manejar fecha de forma segura (parseo local para evitar desfase UTC)
  // Priorizar las fechas reales de auditoría sobre la fecha planeada del proyecto.
  let fecha;
  try {
    fecha = parseLocalDate(
      proyecto.actualizado_en ||
      proyecto.modifiedDate ||
      proyecto.creado_en ||
      proyecto.createdDate ||
      proyecto.fecha
    );
    if (isNaN(fecha.getTime())) {
      fecha = new Date();
    }
  } catch (e) {
    fecha = new Date();
  }

  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const mes = meses[fecha.getMonth()] || 'Ene';

  const dia = fecha.getDate() || 1;

  const anio = fecha.getFullYear() || new Date().getFullYear();

  // Placeholder SVG sin comillas simples para no romper el onerror
  const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect width=%22100%%22 height=%22100%%22 fill=%22%231d2531%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23b8c5d1%22 font-family=Arial font-size=16>Sin imagen</text></svg>";
  const portadaUrl = proyecto.portada && proyecto.portada.url ? proyecto.portada.url : null;

  const imagenUrl = portadaUrl || proyecto.imagen_principal || placeholderSvg;

  const nombreProyecto = proyecto.nombre || proyecto.name || 'Sin nombre';

  const ubicacionProyecto = proyecto.ubicacion || 'Sin ubicación';

  card.innerHTML = `

    <div class="project-image">

      <img src="${imagenUrl}" alt="${nombreProyecto}" loading="lazy" onerror="this.onerror=null; this.src='${placeholderSvg}'">

      <div class="project-date-overlay">

        <div class="date__month">${mes}</div>

        <div class="date__day">${dia}</div>

        <div class="date__year">${anio}</div>

      </div>

      <div class="project-content-overlay">

        <h3 class="project-title">${nombreProyecto}</h3>

        <p class="project-location">${ubicacionProyecto}</p>

        <button class="project-btn" data-project-id="${proyecto.id}">Ver más ></button>

      </div>

    </div>

  `;

  const btn = card.querySelector('.project-btn');

  if (btn && proyecto.id) {

  btn.addEventListener('click', function() {

    const projectId = this.getAttribute('data-project-id');

      if (projectId) {

    loadProjectDetails(projectId);

      }

  });

  }

  return card;

}

// Función para cargar los detalles completos de un proyecto

async function loadProjectDetails(projectId) {
  // Control de concurrencia: evitar múltiples llamadas simultáneas
  const now = Date.now();
  
  // Si ya está cargando el mismo proyecto, esperar a que termine
  if (isLoadingProjectDetails && lastLoadedProjectId === projectId) {
    console.log('⚠️ loadProjectDetails ya está en ejecución para el proyecto', projectId, '- Ignorando llamada duplicada');
    return;
  }
  
  // Marcar como "cargando"
  console.log('🔄 loadProjectDetails iniciando para proyecto:', projectId);
  isLoadingProjectDetails = true;
  lastLoadedProjectId = projectId;
  lastLoadTimestamp = now;

  try {

    resetProjectPermissionState();

    const db = getOfflineDB();
    let proyecto = null;
    let data = null;
    let loadedFromServer = false; // Flag para saber si se cargó desde el servidor

    // PRIMERO: Intentar cargar desde el servidor
    try {
      const response = await fetch(`/api/proyecto/${projectId}/`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      });

      // Verificar si es un error offline
      const isOfflineError = !navigator.onLine || 
        response.status === 503 ||
        (response.status === 503 && window.OfflineSync && window.OfflineSync.isOfflineError && window.OfflineSync.isOfflineError(response));

      if (response.ok && !isOfflineError) {
        // Verificar Content-Type
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
          loadedFromServer = true; // Se cargó desde el servidor
        } else {
          throw new Error('Invalid content type - not JSON');
        }
      } else {
        // Error offline o del servidor, intentar IndexedDB
        throw new Error(`Server error ${response.status} - load from IndexedDB`);
      }
    } catch (error) {
      // Si falla el servidor, intentar cargar desde IndexedDB
      console.log('📴 Error al cargar desde servidor, intentando IndexedDB...', error.message);
      
      if (db) {
        try {
          proyecto = await db.getProyecto(projectId);
          if (proyecto) {
            console.log('✅ Proyecto cargado desde IndexedDB:', projectId);
            data = { success: true, proyecto: proyecto };
            loadedFromServer = false; // Se cargó desde IndexedDB
          } else {
            isLoadingProjectDetails = false;
            showErrorMessage('Proyecto no encontrado. Verifica tu conexión a internet o sincroniza los datos.');
            return null;
          }
        } catch (dbError) {
          console.warn('⚠️ Error al cargar proyecto desde IndexedDB:', dbError);
          isLoadingProjectDetails = false;
          showErrorMessage('Error al cargar proyecto. Verifica tu conexión a internet o sincroniza los datos.');
          return null;
        }
      } else {
        isLoadingProjectDetails = false;
        showErrorMessage('No se pudo cargar el proyecto. Verifica tu conexión a internet.');
        return null;
      }
    }

    if (data.success) {

      // Guardar el proyecto en variables globales antes de mostrar

      proyecto = data.proyecto;

      currentProjectData = proyecto;

      currentProjectId = proyecto.id;

      // Configurar permisos del usuario (tanto si se cargó desde servidor como desde IndexedDB)
      if (proyecto.permisos && typeof proyecto.permisos === 'object') {
        window.USER_AUTH = window.USER_AUTH || {};
        window.USER_AUTH.permisos = Object.assign({}, window.USER_AUTH.permisos || {}, proyecto.permisos);
        if (typeof proyecto.permisos.es_admin === 'boolean') {
          window.USER_AUTH.isAdmin = proyecto.permisos.es_admin;
        }
        if (typeof proyecto.permisos.es_personal === 'boolean') {
          window.USER_AUTH.isPersonal = proyecto.permisos.es_personal;
        }
        window.USER_AUTH.permisos.puede_gestionar = Boolean(proyecto.permisos.puede_gestionar);
      } else if (window.USER_AUTH) {
        window.USER_AUTH.permisos = Object.assign({}, window.USER_AUTH.permisos || {});
        window.USER_AUTH.permisos.puede_gestionar = false;
      }

      // Determinar si el usuario puede gestionar este proyecto
      let puedeGestionar = null;
      if (typeof proyecto.puede_gestionar === 'boolean') {
        puedeGestionar = proyecto.puede_gestionar;
      } else if (proyecto.permisos && typeof proyecto.permisos.puede_gestionar === 'boolean') {
        puedeGestionar = proyecto.permisos.puede_gestionar;
      } else {
        // Si está offline y no hay permisos explícitos, verificar desde la sesión offline
        const isOffline = !navigator.onLine;
        if (isOffline && window.OfflineAuth) {
          const offlineSession = window.OfflineAuth.getActiveSession();
          if (offlineSession && offlineSession.userInfo) {
            // Si es admin, puede gestionar todos los proyectos
            if (offlineSession.userInfo.isAdmin || offlineSession.userInfo.rol === 'admin') {
              puedeGestionar = true;
            } else if (offlineSession.userInfo.isPersonal || offlineSession.userInfo.rol === 'personal') {
              // Si es personal, verificar si el proyecto tiene permisos guardados
              // Si el proyecto se guardó con permisos, confiar en ellos
              // Si no, verificar si el usuario está asociado al proyecto
              if (proyecto.permisos?.puede_gestionar !== undefined) {
                puedeGestionar = proyecto.permisos.puede_gestionar;
              } else if (proyecto.puede_gestionar !== undefined) {
                puedeGestionar = proyecto.puede_gestionar;
              } else {
                // Si no hay permisos guardados, verificar si el usuario está en el personal del proyecto
                const personalIds = (proyecto.personal || []).map(p => p.id || p.usuario_id || p.colaborador_id).filter(Boolean);
                const userId = offlineSession.userInfo.id || offlineSession.userInfo.userId;
                const collaboratorId = offlineSession.userInfo.collaboratorId || offlineSession.userInfo.colaborador_id;
                
                // Verificar si el usuario está asociado al proyecto
                puedeGestionar = personalIds.includes(userId) || personalIds.includes(collaboratorId) || true; // Por defecto true para permitir trabajar offline
                console.log('🔐 Verificando permisos personal offline:', {
                  userId,
                  collaboratorId,
                  personalIds,
                  puedeGestionar
                });
              }
            }
          }
        } else {
          // Si está online, verificar con el servidor
          puedeGestionar = await usuarioPuedeGestionarProyecto(proyecto);
        }
      }

      puedeGestionarProyectoActual = Boolean(puedeGestionar);
      console.log('🔐 Permisos configurados:', {
        puedeGestionar: puedeGestionarProyectoActual,
        esAdmin: window.USER_AUTH?.isAdmin,
        esPersonal: window.USER_AUTH?.isPersonal,
        permisos: proyecto.permisos
      });

      // Guardar proyecto completo en IndexedDB para uso offline (solo si se cargó desde el servidor)
      if (loadedFromServer && data && data.success && proyecto && db) {
        try {
          // Normalizar el tipo antes de guardar
          let tipo = proyecto.tipo || proyecto.categoryKey || proyecto.category || null;
          if (tipo && typeof tipo === 'object' && tipo.nombre) {
            tipo = tipo.nombre;
          }
          tipo = tipo ? String(tipo) : null;
          
          // Determinar categoryKey basado en el tipo
          let categoryKey = proyecto.categoryKey || null;
          if (!categoryKey && tipo) {
            const tipoLower = tipo.toLowerCase();
            if (tipoLower.includes('capacitación') || tipoLower.includes('capacitacion')) {
              categoryKey = 'capacitaciones';
            } else if (tipoLower.includes('entrega')) {
              categoryKey = 'entregas';
            } else if (tipoLower.includes('proyecto') || tipoLower.includes('ayuda')) {
              categoryKey = 'proyectos-ayuda';
            }
          }
          
          await db.saveProyecto({
            ...proyecto,
            tipo: tipo,
            categoryKey: categoryKey || tipo,
            // Asegurar que todos los campos importantes estén incluidos
            descripcion: proyecto.descripcion || '',
            cambios: proyecto.cambios || [],
            archivos: proyecto.archivos || [],
            evidencias: proyecto.evidencias || [],
            tarjetas_datos: proyecto.tarjetas_datos || [],
            beneficiarios: proyecto.beneficiarios || [],
            personal: proyecto.personal || [],
            comunidades: proyecto.comunidades || [],
            // Preservar permisos para uso offline
            permisos: proyecto.permisos || {},
            puede_gestionar: proyecto.puede_gestionar ?? proyecto.permisos?.puede_gestionar ?? false,
            ultimo_sync: new Date().toISOString(),
            is_offline: false
          });
          console.log('✅ Proyecto completo guardado en IndexedDB:', projectId, {
            descripcion: proyecto.descripcion ? 'Sí' : 'No',
            cambios: proyecto.cambios?.length || 0,
            archivos: proyecto.archivos?.length || 0
          });
        } catch (error) {
          console.warn('⚠️ Error al guardar proyecto en IndexedDB:', error);
        }
      }

      projectActionButtonSelectors = buildProjectActionButtonSelectors();

      await mostrarDetalleProyecto(proyecto);

      aplicarVisibilidadBotonesGestion(puedeGestionarProyectoActual);

      if (shouldRefreshLatestProjects) {
        shouldRefreshLatestProjects = false;
        promoteProjectToFeatured(proyecto);
      }

      return proyecto;

    } else {

      showErrorMessage('Error al cargar el proyecto: ' + data.error);

    }

  } catch (error) {

    showErrorMessage('Error al cargar el proyecto. Por favor, intenta de nuevo.');

  } finally {
    // Liberar el lock de concurrencia
    isLoadingProjectDetails = false;
  }

  shouldRefreshLatestProjects = false;
  return null;

}

// Función para mostrar los detalles del proyecto en la vista de detalle

async function mostrarDetalleProyecto(proyecto) {
  // Generar un ID único para este renderizado
  const renderizadoId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Contador de renderizados (para debugging)
  if (!window.mostrarDetalleProyectoCount) {
    window.mostrarDetalleProyectoCount = 0;
  }
  window.mostrarDetalleProyectoCount++;

  ensureProjectActionHandlers();
  ensureModalCloseHandlers();

  // IMPORTANTE: Guardar el proyecto en las variables globales para que getCurrentProject() funcione

  currentProjectData = proyecto;

  currentProjectId = proyecto.id;

  // Ocultar todas las vistas y mostrar solo la de detalle

  const mainView = document.querySelector('.projects-main');

  const listView = document.getElementById('projectsListView');

  const detailView = document.getElementById('projectDetailView');

  if (!detailView) {

    return;

  }

  // Ocultar todas las demás vistas

  if (mainView) mainView.style.display = 'none';

  if (listView) listView.style.display = 'none';

  // Mostrar vista de detalle

  detailView.style.display = 'block';

  // Actualizar título y ubicación

  const detailTitle = document.getElementById('detailTitle');

  const detailLocation = document.getElementById('detailLocation');

  const detailDateText = document.getElementById('detailDateText');

  const statusText = document.getElementById('statusText');

  const detailMainImage = document.getElementById('detailMainImage');

  const detailDescription = document.getElementById('detailDescription');

  if (detailTitle) detailTitle.textContent = proyecto.nombre;

  if (detailLocation) detailLocation.textContent = proyecto.ubicacion;

  if (detailDateText) detailDateText.textContent = proyecto.actualizado_en_formatted || proyecto.actualizado_en || proyecto.fecha_display || proyecto.fecha;

  if (statusText) statusText.textContent = proyecto.estado_display || proyecto.estado;

  // Actualizar imagen principal

  if (detailMainImage) {

    const portadaUrl = proyecto.portada && proyecto.portada.url ? proyecto.portada.url : null;

    if (portadaUrl) {

      detailMainImage.src = portadaUrl;

    } else if (proyecto.evidencias && proyecto.evidencias.length > 0) {

      const primeraImagen =
        proyecto.evidencias.find(e => e && e.es_galeria === true && e.es_imagen) ||
        proyecto.evidencias.find(e => e && e.es_imagen);

      if (primeraImagen) {

        detailMainImage.src = primeraImagen.url;

      } else {

        detailMainImage.src = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

      }

    } else {

      detailMainImage.src = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

    }

  }

  // Actualizar descripción

  if (detailDescription) {

    const descripcionTexto = proyecto.descripcion || 'Sin descripción disponible';

    // Mostrar la descripción como texto plano, preservando saltos de línea

    detailDescription.innerHTML = `<p style="white-space: pre-wrap; color: #b8c5d1; line-height: 1.6;">${descripcionTexto.replace(/\n/g, '<br>')}</p>`;

  }

  // Actualizar personal a cargo

  const detailPersonnelInfo = document.getElementById('detailPersonnelInfo');

  if (detailPersonnelInfo && proyecto.personal) {

    if (proyecto.personal.length === 0) {

      detailPersonnelInfo.innerHTML = '<p style="color: #6c757d;">No hay personal asignado a este proyecto.</p>';

    } else {

      detailPersonnelInfo.innerHTML = proyecto.personal.map((persona, index) => {

        return `

        <div class="personnel-card" style="background: rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid #007bff; position: relative;">

          <div style="display: flex; justify-content: space-between; align-items: start;">

            <div style="flex: 1;">

              <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1.1rem;">${persona.nombre || persona.username || 'Sin nombre'}</h4>

              <p style="margin: 4px 0; color: #007bff; font-weight: 500;">${persona.puesto || 'Sin puesto'}</p>

              <p style="margin: 4px 0; color: #b8c5d1; font-size: 0.9rem;">Rol: ${persona.rol_display || persona.rol || 'Sin rol'}</p>

            </div>

          </div>

        </div>

      `;

      }).join('');

    }

  }

  // Actualizar galería de imágenes

  const detailGallery = document.getElementById('detailGallery');

  if (detailGallery) {
    const puedeGestionar = puedeGestionarGaleria();
    const imagenes = Array.isArray(proyecto.evidencias)
      ? proyecto.evidencias.filter(e => e && e.es_imagen && e.es_galeria !== false)
      : [];
    currentProjectGalleryPage = 0;
    renderProjectGalleryImages(imagenes, puedeGestionar);
  }

  // Actualizar datos del proyecto (tarjetas_datos)

  const detailData = document.getElementById('detailData');

  if (detailData && proyecto.tarjetas_datos) {

    // Eliminar duplicados por ID antes de renderizar

    const tarjetasUnicas = [];

    const idsVistos = new Set();

    proyecto.tarjetas_datos.forEach(tarjeta => {

      const tarjetaId = tarjeta.id || tarjeta.titulo;

      if (!idsVistos.has(tarjetaId)) {

        idsVistos.add(tarjetaId);

        tarjetasUnicas.push(tarjeta);

      } else {

      }

    });

    if (tarjetasUnicas.length === 0) {

      detailData.innerHTML = '<p style="color: #6c757d; grid-column: 1 / -1;">No hay datos del proyecto registrados.</p>';

    } else {

      detailData.innerHTML = tarjetasUnicas.map(tarjeta => {

        // Para la tarjeta de Beneficiarios, mostrar solo el número si contiene "beneficiarios" o "beneficiario"

        let valorMostrar = tarjeta.valor || 'Sin valor';

        if (tarjeta.titulo === 'Beneficiarios' && tarjeta.icono === '👨‍👩‍👧‍👦') {

          // Extraer solo el número del valor

          const numeroMatch = valorMostrar.toString().match(/^(\d+)/);

          if (numeroMatch) {

            valorMostrar = numeroMatch[1];

          }

        }

        return `

        <div class="data-item" style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; border-left: 3px solid #007bff;">

          <div class="data-icon" style="font-size: 2rem; margin-bottom: 8px;">${tarjeta.icono || '📊'}</div>

          <div class="data-content">

            <h4 style="margin: 0 0 8px 0; color: #ffffff; font-size: 1rem; font-weight: 600;">${tarjeta.titulo}</h4>

            <p style="margin: 0; color: #b8c5d1; font-size: 0.9rem;">${valorMostrar}</p>

          </div>

        </div>

      `;

      }).join('');

    }

  }

  // Actualizar comunidades alcanzadas

  const detailCommunities = document.getElementById('detailCommunities');

  if (detailCommunities) {

    const rawCommunities = [

      ...(Array.isArray(proyecto.communities) ? proyecto.communities : []),

      ...(Array.isArray(proyecto.comunidades) ? proyecto.comunidades : []),

    ];

    const normalizedCommunities = normalizeCommunitiesData(rawCommunities);

    if (normalizedCommunities.length) {

      loadCommunities(normalizedCommunities);

    } else {

      loadCommunities([]);

    }

  }

  // Actualizar archivos del proyecto

  const detailFiles = document.getElementById('detailFiles');

  if (detailFiles && Array.isArray(proyecto.archivos)) {

    // Verificar si el usuario tiene permisos (admin o personal)

    const puedeGestionar = puedeGestionarGaleria();

    if (proyecto.archivos.length === 0) {

      detailFiles.innerHTML = '<p style="color: #6c757d;">No hay archivos adjuntos para este proyecto.</p>';

    } else {
      // ORDENAR ARCHIVOS: 
      // 1. Evidencias primero (ordenadas por fecha antigua primero - orden original)
      // 2. Archivos del proyecto después (ordenados por fecha reciente primero - nuevos arriba)
      const archivosOrdenados = [...proyecto.archivos].sort((a, b) => {
        // Separar evidencias de archivos del proyecto
        const aEsEvidencia = a.es_evidencia === true;
        const bEsEvidencia = b.es_evidencia === true;
        
        // Si ambos son evidencias o ambos son archivos del proyecto, ordenar por fecha
        if (aEsEvidencia === bEsEvidencia) {
          const fechaA = a.creado_en ? new Date(a.creado_en) : new Date(0);
          const fechaB = b.creado_en ? new Date(b.creado_en) : new Date(0);
          
          if (aEsEvidencia) {
            // Evidencias: ordenar por fecha antigua primero (ascendente)
            return fechaA - fechaB;
          } else {
            // Archivos del proyecto: ordenar por fecha reciente primero (descendente)
            return fechaB - fechaA;
          }
        }
        
        // Evidencias siempre primero (antes de archivos del proyecto)
        return aEsEvidencia ? -1 : 1;
      });

      detailFiles.innerHTML = archivosOrdenados.map(archivo => {
        // Si el archivo está en base64 (offline), crear URL temporal
        let archivoUrl = archivo.url || archivo.archivo || '';
        if (archivo.base64 && !archivoUrl) {
          try {
            const mimeType = archivo.tipo || (archivo.es_imagen ? 'image/jpeg' : 'application/octet-stream');
            const blob = base64ToBlob(archivo.base64, mimeType);
            archivoUrl = URL.createObjectURL(blob);
          } catch (error) {
            console.warn('Error al crear URL desde base64:', error);
          }
        }

        const extension = archivo.es_imagen ? 'IMG' : (archivo.nombre.split('.').pop()?.toUpperCase() || 'FILE');

        const tamanioTexto = archivo.tamanio ? formatFileSize(archivo.tamanio) : '';
        
        // Indicador de archivo offline
        const offlineBadge = archivo.es_offline ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; margin-left: 6px;">OFFLINE</span>' : '';

        const puedeEliminar = puedeGestionar && !archivo.es_evidencia; // Solo se pueden eliminar archivos que NO sean evidencias Y si tiene permisos
        const puedeEditar = puedeGestionar && !archivo.es_evidencia;
        const descripcionVisible = archivo.descripcion ? escapeHtml(archivo.descripcion) : '';
        const descripcionEncoded = archivo.descripcion ? encodeURIComponent(archivo.descripcion) : '';

        // Si puede gestionar, mostrar enlace clickeable, si no, solo texto
        // Escapar HTML del nombre del archivo para seguridad
        const nombreArchivoEscapado = escapeHtml(archivo.nombre);
        const nombreArchivo = puedeGestionar 
          ? `<a href="${archivoUrl || archivo.url || '#'}" target="_blank" rel="noopener noreferrer" title="${nombreArchivoEscapado}">${nombreArchivoEscapado}${offlineBadge}</a>`
          : `<span style="color: #6c757d; cursor: not-allowed;" title="Debes iniciar sesión como admin o personal para ver/descargar archivos">${nombreArchivoEscapado}</span>`;

        return `

          <div class="file-item" style="border-left: 3px solid ${archivo.es_evidencia ? '#6c757d' : '#007bff'};">

            <div class="file-icon">

              ${extension}

            </div>

            <div class="file-info">

              <h4>

                ${nombreArchivo}

              </h4>

              ${archivo.descripcion ? `<p>${descripcionVisible}</p>` : ''}

              <div>

                ${tamanioTexto ? `<span>${tamanioTexto}</span>` : ''}

                ${archivo.es_imagen ? '<span style="color: #0ea5e9;">(Evidencia - Imagen)</span>' : (archivo.es_evidencia ? '<span style="color: #6c757d;">(Evidencia)</span>' : '<span style="color: #28a745;">(Archivo del proyecto)</span>')}

              </div>

            </div>

          ${puedeGestionar ? `
          <div class="file-actions">
            <a class="file-download-btn" href="${archivoUrl || archivo.url || '#'}" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Descargar
            </a>
              ${puedeEditar ? `
                <button class="file-edit-btn" data-edit-archivo-id="${archivo.id}" data-archivo-descripcion="${descripcionEncoded}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                  </svg>
                  Editar
                </button>
              ` : ''}
              ${puedeEliminar ? `
                <button class="btn-danger btn-cover-remove" data-archivo-id="${archivo.id}" data-file-id="${archivo.id}" title="Eliminar archivo">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Eliminar
                </button>
              ` : ''}
            </div>
          ` : ''}

          </div>

        `;

      }).join('');

      // Agregar event listeners a los botones de editar/eliminar solo si el usuario tiene permisos

      if (puedeGestionar) {

        detailFiles.querySelectorAll('[data-edit-archivo-id]').forEach(btn => {

          btn.addEventListener('click', function (e) {
            e.preventDefault();
            const archivoId = this.getAttribute('data-edit-archivo-id');
            const descripcion = this.getAttribute('data-archivo-descripcion');
            const decoded = descripcion ? decodeURIComponent(descripcion) : '';
            showEditProjectFileDescriptionModal(archivoId, decoded);
          });

        });

        detailFiles.querySelectorAll('[data-archivo-id]').forEach(btn => {

          btn.addEventListener('click', async function(e) {

            e.stopPropagation();

            const archivoId = this.getAttribute('data-archivo-id');

            // Obtener el nombre del archivo para el mensaje de confirmación

            const fileItem = this.closest('.file-item');

            const fileNameElement = fileItem ? fileItem.querySelector('.file-info h4 a, .file-info h4 span') : null;

            const fileName = fileNameElement ? fileNameElement.textContent.trim() : 'este archivo';

            // Mostrar modal de confirmación

            showConfirmModal(

              `¿Estás seguro de que deseas eliminar el archivo "${fileName}"? Esta acción no se puede deshacer.`,

              async () => {

                await eliminarArchivoProyecto(archivoId);

              }

            );

          });

        });

      }

    }

  } else if (detailFiles) {

    detailFiles.innerHTML = '<p style="color: #6c757d;">No hay archivos adjuntos para este proyecto.</p>';

  }

  // Cambios realizados

  if (proyecto.cambios && proyecto.cambios.length > 0) {

    await renderCambios(proyecto.cambios);

  } else {

    const detailChanges = document.getElementById('detailChanges');

    if (detailChanges) {

      detailChanges.innerHTML = '<p style="color: #6c757d;">No hay cambios registrados para este proyecto.</p>';

    }

  }

  // Scroll al inicio

  window.scrollTo({ top: 0, behavior: 'smooth' });

}
// Función para generar elementos de lista

function generateListItems(projects, showType = false) {

  return projects.map(project => `

    <div class="list-item">

      <div class="list-item-content">

        <div class="list-item-header">

          <h3 class="list-item-title">${project.name}</h3>

          ${showType ? `<span class="list-item-type">${project.type}</span>` : ''}

        </div>

        <div class="list-item-details">

          <div class="list-item-location">${project.location}</div>

          <div class="list-item-dates">

            <div class="list-item-date">

              <strong>Creado:</strong> ${formatDate(project.createdDate)}

            </div>

            <div class="list-item-date">

              <strong>Modificado:</strong> ${formatDate(project.modifiedDate)}

            </div>

          </div>

        </div>

      </div>

      <div class="list-item-actions">

        <button class="list-item-btn" data-project-id="${project.id}">Ver más</button>

      </div>

    </div>

  `).join('');

}

// Variable global para almacenar los proyectos originales de la vista actual

let currentListViewProjects = [];

let currentListViewCategory = null;

let currentListViewTypeFilter = 'all';

let currentProjectSearchTerm = '';

function applyProjectListFilters() {

  let filteredProjects = [];

  // Si hay un término de búsqueda, buscar en TODOS los proyectos del sistema
  if (currentProjectSearchTerm.trim() !== '') {
    // Obtener todos los proyectos de todas las categorías
    const allProjects = [
      ...projectsData.capacitaciones,
      ...projectsData.entregas,
      ...projectsData['proyectos-ayuda']
    ];
    
    const searchLower = currentProjectSearchTerm.toLowerCase().trim();
    
    // Buscar en todos los proyectos
    filteredProjects = allProjects.filter((project) => {
      const nombre = (project.nombre || project.name || '').toLowerCase();
      const ubicacion = (project.ubicacion || project.location || '').toLowerCase();
      const descripcion = (project.descripcion || project.description || '').toLowerCase();
      
      // Buscar en nombre, ubicación y descripción
      return nombre.includes(searchLower) || 
             ubicacion.includes(searchLower) || 
             descripcion.includes(searchLower);
    });
    
    // Si hay un filtro de tipo activo, aplicarlo después de la búsqueda
    if (!currentListViewCategory && currentListViewTypeFilter !== 'all') {
      filteredProjects = filteredProjects.filter((project) => {
        const categoryKey = (project.categoryKey || project.category || '').toLowerCase();
        
        if (categoryKey === currentListViewTypeFilter) {
          return true;
        }
        
        const typeLabel = (project.type || '').toLowerCase();
        
        if (!typeLabel) {
          return false;
        }
        
        if (currentListViewTypeFilter === 'capacitaciones') {
          return typeLabel.includes('capacit');
        }
        
        if (currentListViewTypeFilter === 'entregas') {
          return typeLabel.includes('entrega');
        }
        
        if (currentListViewTypeFilter === 'proyectos-ayuda') {
          return typeLabel.includes('ayuda') || typeLabel.includes('proyecto');
        }
        
        return false;
      });
    }
  } else {
    // Si no hay búsqueda, usar la lógica normal con los proyectos de la vista actual
    filteredProjects = [...currentListViewProjects];
    
    if (!currentListViewCategory && currentListViewTypeFilter !== 'all') {
      filteredProjects = filteredProjects.filter((project) => {
        const categoryKey = (project.categoryKey || project.category || '').toLowerCase();
        
        if (categoryKey === currentListViewTypeFilter) {
          return true;
        }
        
        const typeLabel = (project.type || '').toLowerCase();
        
        if (!typeLabel) {
          return false;
        }
        
        if (currentListViewTypeFilter === 'capacitaciones') {
          return typeLabel.includes('capacit');
        }
        
        if (currentListViewTypeFilter === 'entregas') {
          return typeLabel.includes('entrega');
        }
        
        if (currentListViewTypeFilter === 'proyectos-ayuda') {
          return typeLabel.includes('ayuda') || typeLabel.includes('proyecto');
        }
        
        return false;
      });
    }
  }

  const projectsList = document.getElementById('projectsList');

  if (projectsList) {

    projectsList.innerHTML = generateListItems(filteredProjects, !currentListViewCategory);

    setTimeout(() => {

      addViewMoreListeners();

    }, 100);

  }

}

// Función para filtrar proyectos por nombre

function filterProjectsBySearch(searchTerm) {

  currentProjectSearchTerm = searchTerm || '';
  
  // Si hay un término de búsqueda, asegurarse de que estamos mostrando todos los proyectos
  if (searchTerm && searchTerm.trim() !== '') {
    // Si estamos en una categoría específica, cambiar a "Todos los Proyectos"
    if (currentListViewCategory) {
      // Actualizar los proyectos a todos los proyectos del sistema
      currentListViewProjects = [
        ...projectsData.capacitaciones,
        ...projectsData.entregas,
        ...projectsData['proyectos-ayuda']
      ];
      currentListViewCategory = null;
      
      // Actualizar el título y subtítulo
      const listTitle = document.getElementById('listTitle');
      const listSubtitle = document.getElementById('listSubtitle');
      if (listTitle) listTitle.textContent = 'Todos los Proyectos';
      if (listSubtitle) listSubtitle.textContent = 'Resultados de búsqueda en todos los proyectos';
      
      // Resetear el filtro de tipo a "Todos los tipos"
      const typeFilter = document.getElementById('projectTypeFilter');
      if (typeFilter) typeFilter.value = 'all';
      currentListViewTypeFilter = 'all';
    }
  }

  applyProjectListFilters();

}

// Exponer funciones globalmente para uso desde navigation.js
if (typeof window !== 'undefined') {
  window.showListView = showListView;
  window.filterProjectsBySearch = filterProjectsBySearch;
}

// Función para mostrar vista de lista

function showListView(category = null) {

  const mainView = document.querySelector('.projects-main');

  const listView = document.getElementById('projectsListView');

  const listTitle = document.getElementById('listTitle');

  const listSubtitle = document.getElementById('listSubtitle');

  const projectsList = document.getElementById('projectsList');

  const searchInput = document.getElementById('projectSearchInput');

  const searchClearBtn = document.getElementById('searchClearBtn');

  const typeFilter = document.getElementById('projectTypeFilter');

  if (!listView) {

    return;

  }

  // Ocultar vista principal

  if (mainView) mainView.style.display = 'none';

  // Mostrar vista de lista

  listView.style.display = 'block';

  let projects = [];

  let title = '';

  let subtitle = '';

  if (category) {

    // Mostrar proyectos de una categoría específica

    projects = projectsData[category] || [];

    const categoryNames = {

      'capacitaciones': 'Capacitaciones',

      'entregas': 'Entregas',

      'proyectos-ayuda': 'Proyectos de Ayuda'

    };

    title = categoryNames[category] || 'Categoría';

    subtitle = `Lista completa de ${title.toLowerCase()}`;

  } else {

    // Mostrar todos los proyectos

    projects = [

      ...projectsData.capacitaciones,

      ...projectsData.entregas,

      ...projectsData['proyectos-ayuda']

    ];

    title = 'Todos los Proyectos';

    subtitle = 'Lista completa de proyectos y eventos';

  }

  // Guardar los proyectos originales y la categoría actual

  currentListViewProjects = projects;

  currentListViewCategory = category;

  currentProjectSearchTerm = '';

  if (typeFilter) {

    if (category) {

      typeFilter.value = category;

      typeFilter.disabled = true;

      typeFilter.classList.add('is-disabled');

      currentListViewTypeFilter = category;

    } else {

      typeFilter.value = 'all';

      typeFilter.disabled = false;

      typeFilter.classList.remove('is-disabled');

      currentListViewTypeFilter = 'all';

    }

  } else {

    currentListViewTypeFilter = category || 'all';

  }

  // Actualizar títulos

  listTitle.textContent = title;

  listSubtitle.textContent = subtitle;

  // Limpiar el buscador

  if (searchInput) {

    searchInput.value = '';

  }

  if (searchClearBtn) {

    searchClearBtn.style.display = 'none';

  }

  applyProjectListFilters();

  // Scroll al inicio

  window.scrollTo(0, 0);

}

// Función para volver a la vista principal

function showMainView() {

  const mainView = document.querySelector('.projects-main');

  const listView = document.getElementById('projectsListView');

  // Ocultar vista de lista

  listView.style.display = 'none';

  // Mostrar vista principal

  mainView.style.display = 'block';

  // Scroll al inicio

  window.scrollTo(0, 0);

}

// Función para hacer scroll suave a una sección

function scrollToSection(sectionId) {

  const section = document.getElementById(sectionId);

  if (section) {

    // Calcular la posición considerando el header fijo

    const headerHeight = document.querySelector('.topbar').offsetHeight + 

                        document.querySelector('.nav').offsetHeight;

    const sectionTop = section.offsetTop - headerHeight - 20; // 20px de margen adicional

    window.scrollTo({

      top: sectionTop,

      behavior: 'smooth'

    });

    // Agregar efecto de resaltado temporal

    section.classList.add('scroll-highlight');

    // Remover el efecto después de 3 segundos

    setTimeout(() => {

      section.classList.remove('scroll-highlight');

    }, 3000);

  }

}

// Función para manejar el scroll automático desde URL

function handleUrlAnchor() {

  const hash = window.location.hash;

  if (hash) {

    // Remover el # del hash

    const sectionId = hash.substring(1);

    // Esperar un poco para que la página se cargue completamente

    setTimeout(() => {

      scrollToSection(sectionId);

    }, 300); // Aumentado el tiempo para asegurar que todo esté cargado

  }

}

// ======= FUNCIONALIDAD DE VISTA DETALLADA =======

// Datos de proyectos detallados (simulados)

const projectDetails = {

  'proyecto-1': {

    title: 'ESCUELA #297',

    location: 'Centro Escolar Lotificación Campo Verde',

    date: 'octubre 17, 2025',

    type: 'Capacitación',

    status: 'En ejecución',

    mainImage: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',

    personnel: [

      { name: 'Juan Pérez', role: 'Coordinador Principal', id: 'juan-perez' },

      { name: 'María Gómez', role: 'Técnica Agrícola', id: 'maria-gomez' }

    ],

    gallery: [

      { url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Vista general del proyecto' },

      { url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Trabajos en progreso' },

      { url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Detalle de construcción' },

      { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Materiales utilizados' }

    ],

    data: [

      { icon: '😊', label: 'Cantidad de estudiantes', value: '31' },

      { icon: '💰', label: 'Monto de inversión', value: '$ 601 mil' },

      { icon: '📏', label: 'Área de construcción', value: '390 m²' },

      { icon: '🏢', label: 'Institución ejecutora', value: 'Dirección General de Centros Penales' },

      { icon: '🎓', label: 'Nivel educativo', value: 'Parvularia a Básica' }

    ],

    files: [

      {

        id: 'file_1',

        name: 'Plan de Construcción',

        description: 'Documento técnico con los planos y especificaciones del proyecto',

        originalName: 'plan_construccion_escuela_297.pdf',

        size: 2048576,

        type: 'application/pdf',

        extension: 'pdf',

        uploadDate: '2024-11-15T10:30:00Z',

        url: '#'

      },

      {

        id: 'file_2',

        name: 'Presupuesto Detallado',

        description: 'Desglose completo de costos y materiales del proyecto',

        originalName: 'presupuesto_detallado.xlsx',

        size: 512000,

        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

        extension: 'xlsx',

        uploadDate: '2024-11-20T14:15:00Z',

        url: '#'

      },

      {

        id: 'file_3',

        name: 'Acta de Inicio',

        description: 'Documento oficial que marca el inicio de las obras',

        originalName: 'acta_inicio_obras.docx',

        size: 256000,

        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

        extension: 'docx',

        uploadDate: '2024-11-25T09:45:00Z',

        url: '#'

      }

    ],

    communities: [

      { name: 'Comunidad San José', region: 'Región Norte' },

      { name: 'Comunidad El Progreso', region: 'Región Norte' },

      { name: 'Comunidad La Esperanza', region: 'Región Sur' }

    ],

    description: `

      <p>El proyecto consiste en la escarificación de paredes para retirar las capas de pintura en mal estado y preparar las superficies para repello, afinado y aplicación de nueva pintura, logrando un acabado uniforme y de alta calidad.</p>

      <p>De manera simultánea, se nivelarán los pisos interiores y se coloca porcelanato de alto tráfico, que aporta mayor resistencia y una imagen renovada a los espacios.</p>

    `,

    changes: []

  },

  '1': {

    title: 'CAPACITACIÓN TÉCNICA AVANZADA',

    location: 'Los Pinos, Región 3',

    date: 'noviembre 28, 2024',

    type: 'Capacitación',

    status: 'Completado',

    mainImage: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',

    gallery: [

      { url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Capacitación técnica' }

    ],

    data: [

      { icon: '👥', label: 'Participantes', value: '30 técnicos' },

      { icon: '⏱️', label: 'Duración', value: '6 horas' },

      { icon: '🎯', label: 'Objetivo', value: 'Mejorar técnicas agrícolas' },

      { icon: '📊', label: 'Evaluación', value: '95% aprobación' }

    ],

    communities: [

      { name: 'Los Pinos', region: 'Región 3' }

    ],

    description: `

      <p>Capacitación especializada en técnicas avanzadas de cultivo y manejo de suelos para técnicos agrícolas de la región.</p>

      <p>Se incluyeron módulos sobre agricultura sostenible, manejo integrado de plagas y técnicas de riego eficiente.</p>

    `,

    changes: []

  },

  '2': {

    title: 'TALLER DE DESARROLLO COMUNITARIO',

    location: 'Aldea San Miguel, Región 1',

    date: 'noviembre 25, 2024',

    type: 'Capacitación',

    status: 'Completado',

    mainImage: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',

    personnel: [

      { name: 'Carlos Rodríguez', role: 'Especialista en Proyectos', id: 'carlos-rodriguez' }

    ],

    gallery: [

      { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Taller comunitario' }

    ],

    data: [

      { icon: '👥', label: 'Participantes', value: '45 líderes comunitarios' },

      { icon: '⏱️', label: 'Duración', value: '8 horas' }

    ],

    communities: [

      { name: 'Aldea San Miguel', region: 'Región 1' }

    ],

    description: `

      <p>Taller integral de desarrollo comunitario enfocado en fortalecer las capacidades de liderazgo y organización comunitaria.</p>

    `,

    changes: []

  },

  '3': {

    title: 'CURSO DE AGRICULTURA SOSTENIBLE',

    location: 'Centro Panchisivic, Región 8',

    date: 'noviembre 20, 2024',

    type: 'Capacitación',

    status: 'En ejecución',

    mainImage: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',

    personnel: [

      { name: 'Ana Martínez', role: 'Supervisora de Campo', id: 'ana-martinez' }

    ],

    gallery: [

      { url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', description: 'Curso de agricultura' }

    ],

    data: [

      { icon: '👥', label: 'Participantes', value: '20 agricultores' },

      { icon: '⏱️', label: 'Duración', value: '12 horas' }

    ],

    communities: [

      { name: 'Centro Panchisivic', region: 'Región 8' }

    ],

    description: `

      <p>Curso especializado en agricultura sostenible y técnicas orgánicas de cultivo para mejorar la productividad sin dañar el medio ambiente.</p>

    `,

    changes: []

  }

};

// Función para mostrar la vista detallada

function showProjectDetail(projectId) {

  const mainView = document.querySelector('.projects-main');

  const listView = document.getElementById('projectsListView');

  const detailView = document.getElementById('projectDetailView');

  if (!detailView) {

    return;

  }

  // Ocultar otras vistas

  if (mainView) mainView.style.display = 'none';

  if (listView) listView.style.display = 'none';

  // Mostrar vista detallada (con indicador de carga)

  detailView.style.display = 'block';

  // Scroll al inicio

  window.scrollTo(0, 0);

  // Cargar datos del proyecto desde la API

  loadProjectDetails(projectId);

}
// Función para cargar los datos del proyecto en la vista detallada (LEGACY - usar mostrarDetalleProyecto)

async function loadProjectDetail(project) {

  // Actualizar las variables globales

  currentProjectData = project;

  // Título y ubicación

  document.getElementById('detailTitle').textContent = project.title;

  document.getElementById('detailLocation').textContent = project.location;

  document.getElementById('detailDateText').textContent = project.date;

  // Imagen principal

  const mainImage = document.getElementById('detailMainImage');

  mainImage.src = project.mainImage;

  mainImage.alt = `Imagen principal de ${project.title}`;

  // Estado

  document.getElementById('statusText').textContent = project.status;

  // Personal a cargo

  if (project.personnel) {

    loadPersonnelInfo(project.personnel);

  }

  // Galería de imágenes
  // NOTA: Deshabilitado porque mostrarDetalleProyecto() ya maneja la galería con renderProjectGalleryImages()
  // Esto evita duplicación de imágenes
  
  // if (project.gallery) {
  //   loadGalleryWithDescriptions(project.gallery);
  // }

  // Datos del proyecto

  const dataContainer = document.getElementById('detailData');

  if (dataContainer) {

    dataContainer.innerHTML = '';

    if (project.data && project.data.length > 0) {

      project.data.forEach(item => {

        const dataItem = document.createElement('div');

        dataItem.className = 'data-item';

        dataItem.innerHTML = `

          <div class="data-icon">${item.icon}</div>

          <div class="data-content">

            <h4>${item.label}</h4>

            <p>${item.value}</p>

          </div>

        `;

        dataContainer.appendChild(dataItem);

      });

    }

  }

  // Ubicación

  const projectCommunities = [

    ...(Array.isArray(project.communities) ? project.communities : []),

    ...(Array.isArray(project.comunidades) ? project.comunidades : []),

  ];

  if (projectCommunities.length) {

    const normalizedCommunities = normalizeCommunitiesData(projectCommunities);

    if (normalizedCommunities.length) {

      loadCommunities(normalizedCommunities);

    } else {

      loadCommunities([]);

    }

  } else {

    loadCommunities([]);

  }

  // Descripción

  const detailDescription = document.getElementById('detailDescription');

  if (detailDescription) {

    detailDescription.innerHTML = project.description || '';

  }

  // Cambios realizados - IMPORTANTE: usar project.cambios o project.changes

  const cambios = project.cambios || project.changes || [];

  if (cambios && cambios.length > 0) {

    await renderCambios(cambios);

  } else {

    const detailChanges = document.getElementById('detailChanges');

    if (detailChanges) {

      detailChanges.innerHTML = '<p style="color: #6c757d;">No hay cambios registrados para este proyecto.</p>';

    }

  }

  // Scroll al inicio

  window.scrollTo({ top: 0, behavior: 'smooth' });

}

// Función para abrir modal de imagen (placeholder)

function openImageModal(imageUrl) {

  // Por ahora, abrir en nueva pestaña

  window.open(imageUrl, '_blank');

}

// Función para volver a la vista principal desde la vista detallada

function backFromDetail() {

  resetProjectPermissionState();
  projectActionButtonSelectors = buildProjectActionButtonSelectors();

  const mainView = document.querySelector('.projects-main');

  const listView = document.getElementById('projectsListView');

  const detailView = document.getElementById('projectDetailView');

  // Ocultar vistas de detalle y lista

  if (detailView) detailView.style.display = 'none';

  if (listView) listView.style.display = 'none';

  // Mostrar vista principal

  if (mainView) mainView.style.display = 'block';

  // Scroll al inicio

  window.scrollTo(0, 0);

}

// Event listener para el botón de volver desde la vista detallada
const btnBackFromDetail = document.getElementById('btnBackFromDetail');
if (btnBackFromDetail) {
  btnBackFromDetail.addEventListener('click', backFromDetail);
}

// Función para agregar event listeners a los botones "Ver más"

function addViewMoreListeners() {

  // Buscar todos los botones "Ver más" en las tarjetas

  const viewMoreButtons = document.querySelectorAll('.project-card .project-btn');

  viewMoreButtons.forEach(button => {

    // Remover event listeners existentes

    button.removeEventListener('click', handleProjectCardClick);

    // Agregar nuevo event listener

    button.addEventListener('click', handleProjectCardClick);

  });

  // Buscar todos los botones "Ver más" en la lista

  const listViewMoreButtons = document.querySelectorAll('.list-item-btn');

  listViewMoreButtons.forEach(button => {

    // Remover event listeners existentes

    button.removeEventListener('click', handleListItemClick);

    // Agregar nuevo event listener

    button.addEventListener('click', handleListItemClick);

  });

}

// Función para manejar clicks en botones de tarjetas

function handleProjectCardClick(e) {

  e.preventDefault();

  const projectId = this.getAttribute('data-project-id') || 'proyecto-1';

  showProjectDetail(projectId);

}

// Función para manejar clicks en botones de lista

function handleListItemClick(e) {

  e.preventDefault();

  const projectId = this.getAttribute('data-project-id');

  if (projectId) {

    showProjectDetail(projectId);

  }

}

// Variables globales para almacenar datos del proyecto actual

let currentProjectData = null;

let currentProjectId = null;

let pendingAction = null; // Para almacenar la acción pendiente después de verificar credenciales

// Variables de control de concurrencia para loadProjectDetails
let isLoadingProjectDetails = false;
let lastLoadedProjectId = null;
let lastLoadTimestamp = 0;

// Variable de control para evitar múltiples guardados simultáneos
let isSavingProjectData = false;

let pendingProjectGalleryImages = [];
let currentProjectGalleryImages = [];
let currentProjectGalleryPage = 0;
let currentProjectGalleryCanManage = false;
const PROJECT_GALLERY_PAGE_SIZE = 4;
const FEATURED_PROJECTS_LIMIT = 3;
let featuredProjectsData = [];
let shouldRefreshLatestProjects = false;

let currentProjectFileEdit = null;

function revokePendingImagePreview(item) {
  if (!item) {
    return;
  }

  if (
    item.objectUrl &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    try {
      URL.revokeObjectURL(item.objectUrl);
    } catch (error) {
    }
    item.objectUrl = null;
  }
}

function getGuatemalaDateParts(sourceDate = new Date()) {
  const baseFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = baseFormatter.formatToParts(sourceDate);
  const getValue = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };

  const year = getValue('year');
  const month = getValue('month');
  const day = getValue('day');
  const hour = getValue('hour');
  const minute = getValue('minute');

  const formatted = new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(sourceDate);

  return {
    year,
    month,
    day,
    hour,
    minute,
    formatted,
  };
}

// Variable para almacenar archivos de evidencias seleccionados en el modal de cambios

let selectedEvidencesFiles = [];
// Variable para rastrear evidencias marcadas para eliminación en el modal de edición
let evidenciasAEliminar = [];

// Sistema de permisos manejado por permisos.js y el backend

// ======= DATOS FICTICIOS =======

// Comunidades disponibles para asociar a un proyecto (se cargan desde /api/comunidades/)
let availableCommunities = [];
let availableCommunitiesLoaded = false;

// IDs de comunidades seleccionadas en el modal de comunidades
let selectedCommunityIds = new Set();

// ======= TARJETAS PREDEFINIDAS =======

const predefinedCards = [

  { id: 'participants', icon: '👥', label: 'Participantes', placeholder: 'Ej: 30 técnicos', category: 'General' },

  { id: 'duration', icon: '⏱️', label: 'Duración', placeholder: 'Ej: 6 horas', category: 'General' },

  { id: 'objective', icon: '🎯', label: 'Objetivo', placeholder: 'Ej: Mejorar técnicas agrícolas', category: 'General' },

  { id: 'evaluation', icon: '📊', label: 'Evaluación', placeholder: 'Ej: 95% aprobación', category: 'General' },

  { id: 'budget', icon: '💰', label: 'Presupuesto', placeholder: 'Ej: $50,000', category: 'Financiero' },

  { id: 'area', icon: '📏', label: 'Área', placeholder: 'Ej: 2 hectáreas', category: 'Físico' },

  { id: 'institution', icon: '🏢', label: 'Institución Ejecutora', placeholder: 'Ej: MAGA', category: 'Institucional' },

  { id: 'level', icon: '🎓', label: 'Nivel Educativo', placeholder: 'Ej: Básico', category: 'Educativo' },

  { id: 'materials', icon: '🔧', label: 'Materiales', placeholder: 'Ej: Semillas, herramientas', category: 'Recursos' },

  { id: 'location', icon: '📍', label: 'Ubicación Específica', placeholder: 'Ej: Campo experimental', category: 'Físico' },

  { id: 'schedule', icon: '📅', label: 'Cronograma', placeholder: 'Ej: 3 meses', category: 'Temporal' },

  { id: 'methodology', icon: '📋', label: 'Metodología', placeholder: 'Ej: Práctica participativa', category: 'Técnico' },

  { id: 'results', icon: '✅', label: 'Resultados Esperados', placeholder: 'Ej: 80% de éxito', category: 'Evaluación' },

  { id: 'sustainability', icon: '🌱', label: 'Sostenibilidad', placeholder: 'Ej: 5 años', category: 'Ambiental' }

];

const availablePersonnel = [

  { id: 1, name: 'María González', role: 'Coordinadora de Proyectos' },

  { id: 2, name: 'Carlos Rodríguez', role: 'Técnico Agrícola' },

  { id: 3, name: 'Ana Martínez', role: 'Supervisora de Campo' },

  { id: 4, name: 'Luis Hernández', role: 'Especialista en Desarrollo' },

  { id: 5, name: 'Carmen López', role: 'Facilitadora Comunitaria' },

  { id: 6, name: 'Roberto Silva', role: 'Ingeniero Agrónomo' },

  { id: 7, name: 'Patricia Morales', role: 'Coordinadora de Capacitaciones' },

  { id: 8, name: 'Miguel Torres', role: 'Técnico de Campo' },

  { id: 9, name: 'Sofia Ramírez', role: 'Especialista en Sostenibilidad' },

  { id: 10, name: 'Diego Castro', role: 'Coordinador Regional' }

];

let selectedCommunity = null;

let selectedPersonnel = null;

let pendingDeleteAction = null;

let pendingDeleteData = null;

let puedeGestionarProyectoActual = Boolean(
  window.USER_AUTH && window.USER_AUTH.isAuthenticated && window.USER_AUTH.isAdmin
);

function resetProjectPermissionState() {
  puedeGestionarProyectoActual = false;
  window.USER_AUTH = window.USER_AUTH || {};
  window.USER_AUTH.permisos = Object.assign({}, window.USER_AUTH.permisos || {});
  window.USER_AUTH.permisos.puede_gestionar = false;
  try {
    aplicarVisibilidadBotonesGestion(false);
  } catch (error) {
  }
}

let usuarioActualInfoCache = null;
let usuarioActualInfoPromise = null;

const MENSAJE_PERMISOS_INSUFICIENTES = 'No tienes permisos para gestionar este evento.';

const PROJECT_ACTION_BUTTON_SELECTOR_LIST_BASE = [
  '#addImageBtn',
  '#editDataBtn',
  '#editDescriptionBtn',
  '#addCommunityBtn',
];

function buildProjectActionButtonSelectors() {
  if (!window.USER_AUTH || !window.USER_AUTH.isAuthenticated) {
    return [];
  }

  const selectors = PROJECT_ACTION_BUTTON_SELECTOR_LIST_BASE.slice();

  const permissions = (window.USER_AUTH && window.USER_AUTH.permisos) || {};
  const puedeGestionar = Boolean(puedeGestionarProyectoActual) || Boolean(permissions.puede_gestionar);

  if (puedeGestionar) {
    selectors.push('#addChangeBtn', '#addFileBtn');
  }

  return selectors;
}

let projectActionButtonSelectors = buildProjectActionButtonSelectors();

function isProjectActionButton(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  if (typeof element.matches === 'function') {
    return projectActionButtonSelectors.some((selector) => element.matches(selector));
  }

  const id = element.getAttribute && element.getAttribute('id');
  if (!id) {
    return false;
  }

  return projectActionButtonSelectors.some((selector) => selector === `#${id}`);
}

function findProjectActionButton(startElement) {
  let node = startElement;

  while (node && node !== document) {
    if (isProjectActionButton(node)) {
      return node;
    }

    node = node.parentNode;
  }

  return null;
}

let projectActionHandlersRegistered = false;
let modalCloseHandlersRegistered = false;

function handleProjectActionButtonClick(event) {
  projectActionButtonSelectors = buildProjectActionButtonSelectors();
  const actionButton = findProjectActionButton(event.target);
  if (!actionButton || actionButton.disabled) {
    return;
  }

  switch (actionButton.id) {
    case 'addImageBtn':
      showAddImageModal();
      break;
    case 'editDataBtn':
      showEditDataModal();
      break;
    case 'addChangeBtn':
      showAddChangeModal();
      break;
    case 'addFileBtn':
      showAddFileModal();
      break;
    case 'editDescriptionBtn':
      showEditDescriptionModal();
      break;
    case 'addCommunityBtn':
      showAddCommunityModal();
      break;
    default:
      break;
  }
}

function ensureProjectActionHandlers() {
  projectActionButtonSelectors = buildProjectActionButtonSelectors();

  if (projectActionHandlersRegistered) {
    return;
  }

  document.addEventListener('click', handleProjectActionButtonClick);
  projectActionHandlersRegistered = true;
}

const MODAL_CLOSE_MAPPING = {
  closeImageModal: 'addImageModal',
  cancelImageBtn: 'addImageModal',
  closeDescriptionModal: 'editDescriptionModal',
  cancelDescriptionBtn: 'editDescriptionModal',
  closeDataModal: 'editDataModal',
  cancelDataBtn: 'editDataModal',
  closeCommunityModal: 'addCommunityModal',
  cancelCommunityBtn: 'addCommunityModal',
  closePersonnelModal: 'addPersonnelModal',
  cancelPersonnelBtn: 'addPersonnelModal',
  closeChangeModal: 'addChangeModal',
  cancelChangeBtn: 'addChangeModal',
  closeFileModal: 'addFileModal',
  cancelFileBtn: 'addFileModal',
  closeFileDescriptionModal: 'editFileDescriptionModal',
  cancelFileDescriptionBtn: 'editFileDescriptionModal',
  closeAddEvidenceModal: 'addEvidenceModal',
  cancelEvidenceBtn: 'addEvidenceModal',
  closeChangeDetailsBtn: 'changeDetailsModal',
  closeChangeDetailsModal: 'changeDetailsModal',
  closeImageViewModal: 'imageViewModal',
};

function findModalDismissButton(startElement) {
  let node = startElement;

  while (node && node !== document) {
    if (node.id && MODAL_CLOSE_MAPPING[node.id]) {
      return node;
    }

    node = node.parentNode;
  }

  return null;
}

function handleModalDismissClick(event) {
  const dismissButton = findModalDismissButton(event.target);
  if (!dismissButton) {
    return;
  }

  const modalId = MODAL_CLOSE_MAPPING[dismissButton.id];
  if (!modalId) {
    return;
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  hideModal(modalId);
}

function ensureModalCloseHandlers() {
  if (modalCloseHandlersRegistered) {
    return;
  }

  document.addEventListener('click', handleModalDismissClick);
  modalCloseHandlersRegistered = true;
}

async function obtenerUsuarioActualInfo() {
  // Verificar si hay sesión offline activa
  const hasOfflineSession = window.OfflineAuth && window.OfflineAuth.getActiveSession && window.OfflineAuth.getActiveSession();
  const isOffline = !navigator.onLine;
  
  // Si hay sesión offline activa, considerar al usuario como autenticado
  if (hasOfflineSession && hasOfflineSession.userInfo) {
    // Asegurar que USER_AUTH esté configurado con la sesión offline
    if (!window.USER_AUTH || !window.USER_AUTH.isAuthenticated) {
      window.USER_AUTH = hasOfflineSession.userInfo;
    }
  }
  
  if (!window.USER_AUTH || !window.USER_AUTH.isAuthenticated) {
    // Si está offline y no hay sesión offline, retornar null silenciosamente
    if (isOffline) {
      return null;
    }
    return null;
  }

  if (usuarioActualInfoCache) {
    return usuarioActualInfoCache;
  }

  if (usuarioActualInfoPromise) {
    return usuarioActualInfoPromise;
  }

  const url = (window.DJANGO_URLS && window.DJANGO_URLS.usuario) || '/api/usuario/';

  // Usar fetch (que está interceptado por offlineAwareFetch)
  usuarioActualInfoPromise = fetch(url, { credentials: 'include' })
    .then(response => {
      // Verificar si es un error offline esperado
      if (!response.ok) {
        // Si es 503 y estamos offline, es esperado
        if (response.status === 503 && (!navigator.onLine || (window.OfflineSync && window.OfflineSync.isOfflineError && window.OfflineSync.isOfflineError(response)))) {
          // No mostrar error, es esperado cuando está offline
          return null;
        }
        return null;
      }
      return response.json();
    })
    .then(data => {
      // Verificar si la respuesta indica que es offline
      if (data && window.OfflineSync && window.OfflineSync.isOfflineResponse && window.OfflineSync.isOfflineResponse(data)) {
        return null;
      }
      return data;
    })
    .then(data => {
      if (data && data.autenticado !== false) {
        usuarioActualInfoCache = data;

        window.USER_AUTH = window.USER_AUTH || {};

        if (typeof data.isAdmin === 'boolean') {
          window.USER_AUTH.isAdmin = data.isAdmin;
        }

        if (typeof data.permisos === 'object' && data.permisos) {
          window.USER_AUTH.permisos = Object.assign(
            {},
            window.USER_AUTH.permisos || {},
            data.permisos
          );

          if (typeof data.permisos.es_personal === 'boolean') {
            window.USER_AUTH.isPersonal = data.permisos.es_personal;
          }

          if (typeof data.permisos.es_admin === 'boolean') {
            window.USER_AUTH.isAdmin = window.USER_AUTH.isAdmin || data.permisos.es_admin;
          }
        }

        if (data.userId) {
          window.USER_AUTH.userId = data.userId;
        } else if (data.id) {
          window.USER_AUTH.userId = data.id;
        }

        if (data.collaboratorId || data.colaborador_id) {
          window.USER_AUTH.collaboratorId = data.collaboratorId || data.colaborador_id;
        }

        if (data.username) {
          window.USER_AUTH.username = data.username;
        }
      }

      return usuarioActualInfoCache;
    })
    .catch(error => {
      return null;
    })
    .finally(() => {
      usuarioActualInfoPromise = null;
    });

  return usuarioActualInfoPromise;
}

function obtenerIdentificadoresPersonal(proyecto) {
  const ids = new Set();
  const usernames = new Set();

  if (!proyecto || !Array.isArray(proyecto.personal)) {
    if (proyecto && proyecto.responsable_id) {
      ids.add(String(proyecto.responsable_id));
    }
    if (proyecto && proyecto.responsable_colaborador_id) {
      ids.add(String(proyecto.responsable_colaborador_id));
    }
    if (proyecto && proyecto.responsable_username) {
      usernames.add(String(proyecto.responsable_username).toLowerCase());
    }
    return { ids, usernames };
  }

  proyecto.personal.forEach(persona => {
    if (!persona) {
      return;
    }

    const posiblesIds = [
      persona.id,
      persona.colaborador_id,
      persona.colaboradorId,
      persona.usuario_id,
      persona.usuarioId
    ];

    posiblesIds.forEach(valor => {
      if (valor || valor === 0) {
        ids.add(String(valor));
      }
    });

    if (persona.username) {
      usernames.add(String(persona.username).toLowerCase());
    }

    if (persona.usuario_username) {
      usernames.add(String(persona.usuario_username).toLowerCase());
    }
  });

  if (proyecto.responsable_id) {
    ids.add(String(proyecto.responsable_id));
  }

  if (proyecto.responsable_colaborador_id) {
    ids.add(String(proyecto.responsable_colaborador_id));
  }

  if (proyecto.responsable_username) {
    usernames.add(String(proyecto.responsable_username).toLowerCase());
  }

  return { ids, usernames };
}

async function usuarioPuedeGestionarProyecto(proyecto) {
  if (!proyecto) {
    return false;
  }

  if (typeof proyecto.puede_gestionar === 'boolean') {
    return proyecto.puede_gestionar;
  }

  if (proyecto.permisos && typeof proyecto.permisos.puede_gestionar === 'boolean') {
    return proyecto.permisos.puede_gestionar;
  }

  if (window.USER_AUTH && window.USER_AUTH.isAuthenticated && window.USER_AUTH.isAdmin) {
    return true;
  }

  if (!window.USER_AUTH || !window.USER_AUTH.isAuthenticated) {
    return false;
  }

  const info = await obtenerUsuarioActualInfo();
  const assigned = obtenerIdentificadoresPersonal(proyecto);

  const collaboratorId =
    (info && (info.collaboratorId || info.colaborador_id)) || window.USER_AUTH.collaboratorId;
  const userId = (info && (info.userId || info.id)) || window.USER_AUTH.userId;
  const username = (info && info.username) || window.USER_AUTH.username || '';

  if (collaboratorId && assigned.ids.has(String(collaboratorId))) {
    return true;
  }

  if (userId && assigned.ids.has(String(userId))) {
    return true;
  }

  if (username && assigned.usernames.has(String(username).toLowerCase())) {
    return true;
  }

  return false;
}

function tienePermisoGestionActual() {
  
  if (window.USER_AUTH && window.USER_AUTH.isAuthenticated && window.USER_AUTH.isAdmin) {
    return true;
  }
  
  const resultado = !!puedeGestionarProyectoActual;
  return resultado;
}

function mostrarMensajePermisoDenegado() {
  showErrorMessage(MENSAJE_PERMISOS_INSUFICIENTES);
}

function aplicarVisibilidadBotonesGestion(puedeGestionar) {
  // PROTECCIÓN: Si el modal de confirmación está abierto, NO afectar sus botones
  const confirmModal = document.getElementById('confirmDeleteModal');
  const isConfirmModalOpen = confirmModal && confirmModal.classList.contains('active');
  
  const toggleElementoGestion = (element) => {
    if (!element) {
      return;
    }
    
    // PROTECCIÓN: NO afectar botones del modal de confirmación cuando está abierto
    if (isConfirmModalOpen) {
      const modalContent = confirmModal?.querySelector('.modal-content');
      if (modalContent && modalContent.contains(element)) {
        return; // Saltar este elemento si está dentro del modal de confirmación
      }
    }

    if (!element.dataset.originalDisplayValue) {
      const computed = window.getComputedStyle(element);
      let originalDisplay = computed ? computed.display : '';
      if (!originalDisplay || originalDisplay === 'none') {
        originalDisplay = element.tagName === 'BUTTON' ? 'inline-flex' : 'block';
      }
      element.dataset.originalDisplayValue = originalDisplay;
    }

    if (puedeGestionar) {
      element.style.display = element.dataset.originalDisplayValue || '';
      element.removeAttribute('aria-hidden');
      element.classList.remove('is-hidden-by-permissions');
      if (element.tagName === 'BUTTON') {
        element.disabled = false;
      }
    } else {
      if (element.tagName === 'BUTTON') {
        element.disabled = true;
      }
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
      element.classList.add('is-hidden-by-permissions');
    }
  };

  const manageClassSelectors = ['.btn-edit-item', '.btn-add-evidence'];
  manageClassSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(toggleElementoGestion);
  });

  const manageIdSelectors = ['#addCustomCardBtn'];
  manageIdSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(toggleElementoGestion);
  });

  const manageDisableOnlySelectors = [
    '#confirmCommunitySelectionBtn',
    '#confirmChangeSelectionBtn',
    '#confirmFileSelectionBtn'
    // NO incluir '#confirmDeleteBtn' aquí porque el modal de confirmación debe funcionar
    // siempre que esté abierto (las verificaciones de permisos se hacen antes de mostrar el modal)
  ];

  manageDisableOnlySelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      // PROTECCIÓN: NO afectar botones del modal de confirmación cuando está abierto
      if (isConfirmModalOpen) {
        const modalContent = confirmModal?.querySelector('.modal-content');
        if (modalContent && modalContent.contains(element)) {
          return; // Saltar este elemento si está dentro del modal de confirmación
        }
      }
      element.disabled = !puedeGestionar;
    });
  });

  document.querySelectorAll('.remove-card-btn').forEach(btn => {
    // PROTECCIÓN: NO afectar botones del modal de confirmación cuando está abierto
    if (isConfirmModalOpen) {
      const modalContent = confirmModal?.querySelector('.modal-content');
      if (modalContent && modalContent.contains(btn)) {
        return; // Saltar este botón si está dentro del modal de confirmación
      }
    }
    
    if (puedeGestionar) {
      btn.disabled = false;
      btn.classList.remove('disabled');
    } else {
      btn.disabled = true;
      btn.classList.add('disabled');
    }
  });

  const selectedCardsContainer = document.getElementById('selectedCardsContainer');
  if (selectedCardsContainer && typeof loadSelectedCards === 'function') {
    loadSelectedCards();
  }
  
  // PROTECCIÓN FINAL: Si el modal de confirmación está abierto, asegurar que sus botones estén habilitados
  if (isConfirmModalOpen) {
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.disabled = false;
    if (cancelDeleteBtn) cancelDeleteBtn.disabled = false;
  }
}

// Función para verificar si el usuario puede gestionar la galería (admin o personal)

function puedeGestionarGaleria() {
  if (window.USER_AUTH && window.USER_AUTH.isAuthenticated && window.USER_AUTH.isAdmin) {
    return true;
  }
  return !!puedeGestionarProyectoActual;
}

// Función para obtener el proyecto actual

function getCurrentProject() {

  // Usar currentProjectData si está disponible y tiene id

  if (currentProjectData && currentProjectData.id) {

    return currentProjectData;

  }

  // Fallback al proyecto por ID

  if (currentProjectId && projectDetails[currentProjectId]) {

    return projectDetails[currentProjectId];

  }

  // Si currentProjectData existe pero no tiene id, intentar obtenerlo del URL o de otra forma

  if (currentProjectData) {

    // Intentar obtener el ID del URL si está disponible

    const urlParams = new URLSearchParams(window.location.search);

    const projectId = urlParams.get('id');

    if (projectId) {

      currentProjectData.id = projectId;

      currentProjectId = projectId;

      return currentProjectData;

    }

  }

  return null;

}

// Función para establecer el proyecto actual

function setCurrentProject(projectId) {

  currentProjectId = projectId;

  if (projectDetails[projectId]) {

    currentProjectData = projectDetails[projectId];

  }

}

// Función para actualizar los datos del proyecto

function updateProjectData(newData) {

  if (currentProjectData) {

    Object.assign(currentProjectData, newData);

  }

}

// Función para agregar comunidad

async function addCommunityToProject(communityName) {

  const currentProject = getCurrentProject();

  if (!currentProject.communities) {

    currentProject.communities = [];

  }

  // Verificar si ya existe

  const exists = currentProject.communities.some(c => c.name === communityName);

  if (!exists) {

    currentProject.communities.push({

      name: communityName,

      region: 'Región por definir'

    });

    // Actualizar la vista

    await loadProjectDetail(currentProject);

    showSuccessMessage('Comunidad agregada exitosamente');

  } else {

    showErrorMessage('Esta comunidad ya está agregada al proyecto');

  }

}

// Función para agregar personal

async function addPersonnelToProject(personnelData) {

  const currentProject = getCurrentProject();

  if (!currentProject.personnel) {

    currentProject.personnel = [];

  }

  // Verificar si ya existe

  const exists = currentProject.personnel.some(p => p.id === personnelData.id);

  if (!exists) {

    currentProject.personnel.push(personnelData);

    // Actualizar la vista

    await loadProjectDetail(currentProject);

    showSuccessMessage('Personal agregado exitosamente');

  } else {

    showErrorMessage('Este personal ya está agregado al proyecto');

  }

}

// Función para agregar imagen

async function addImageToProject(imageData) {

  const currentProject = getCurrentProject();

  if (!currentProject.gallery) {

    currentProject.gallery = [];

  }

  currentProject.gallery.push(imageData);

  // Actualizar la vista

  await loadProjectDetail(currentProject);

  showSuccessMessage('Imagen agregada exitosamente');

}

// Función para agregar cambio

async function addChangeToProject(changeData) {

  const currentProject = getCurrentProject();

  if (!currentProject.changes) {

    currentProject.changes = [];

  }

  currentProject.changes.push(changeData);

  // Actualizar la vista

  await loadProjectDetail(currentProject);

  showSuccessMessage('Cambio agregado exitosamente');

}
// Función para actualizar descripción

async function updateProjectDescription(newDescription) {

  const currentProject = getCurrentProject();

  currentProject.description = newDescription;

  // Actualizar la vista

  await loadProjectDetail(currentProject);

  showSuccessMessage('Descripción actualizada exitosamente');

}

// Función para actualizar datos del proyecto

async function updateProjectData(newData) {

  const currentProject = getCurrentProject();

  Object.assign(currentProject, newData);

  // Actualizar la vista

  await loadProjectDetail(currentProject);

  showSuccessMessage('Datos actualizados exitosamente');

}

// Función para mostrar modal

function showModal(modalId) {

  const modal = document.getElementById(modalId);

  if (modal) {

    modal.classList.add('active');

    // Contador de modales abiertos: solo bloquear overflow si es el primero
    const openModals = document.querySelectorAll('.modal.active').length;
    if (openModals >= 1) {
      document.body.style.overflow = 'hidden';
    }
    
    // PROTECCIÓN para el modal de confirmación: asegurar que los botones estén habilitados
    if (modalId === 'confirmDeleteModal') {
      const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
      const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
      if (confirmDeleteBtn) {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.style.pointerEvents = 'auto';
        confirmDeleteBtn.style.opacity = '1';
      }
      if (cancelDeleteBtn) {
        cancelDeleteBtn.disabled = false;
        cancelDeleteBtn.style.pointerEvents = 'auto';
        cancelDeleteBtn.style.opacity = '1';
      }
    }

    const firstTextarea = modal.querySelector('textarea');
    if (firstTextarea) {
      setTimeout(() => firstTextarea.focus(), 120);
    }

  }

}

// Función para ocultar modal

function hideModal(modalId) {

  const modal = document.getElementById(modalId);

  if (modal) {

    modal.classList.remove('active');

    // Solo restaurar overflow si ya no hay ningún modal abierto
    const remainingOpenModals = document.querySelectorAll('.modal.active').length;
    if (remainingOpenModals === 0) {
      document.body.style.overflow = '';
    }


    // Si es el modal de confirmación, limpiar el estado
    if (modalId === 'confirmDeleteModal') {
      isConfirmModalOpen = false;
      pendingConfirmAction = null;
      // Detener el intervalo de protección
      if (confirmModalProtectionInterval) {
        clearInterval(confirmModalProtectionInterval);
        confirmModalProtectionInterval = null;
      }
    }

    // Limpiar formulario de cambios si se cierra el modal de cambios

    if (modalId === 'addChangeModal') {

      clearChangeForm();

    }

  }

}

// Función para mostrar modal de credenciales

function showCredentialsModal(callback = null) {

  // Verificar que los elementos existan antes de usarlos

  const adminUsername = document.getElementById('adminUsername');

  const adminPassword = document.getElementById('adminPassword');

  // Limpiar campos antes de mostrar el modal (solo si existen)

  if (adminUsername) adminUsername.value = '';

  if (adminPassword) adminPassword.value = '';

  // Ocultar mensaje de error si existe

  const errorElement = document.getElementById('credentialsError');

  if (errorElement) {

    errorElement.style.display = 'none';

  }

  // Guardar callback si se proporciona

  if (callback) {

    pendingAction = callback;

  }

  showModal('adminCredentialsModal');

}

// Función para verificar credenciales

function verifyCredentials() {

  const username = document.getElementById('adminUsername').value;

  const password = document.getElementById('adminPassword').value;

  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {

    // Limpiar campos antes de cerrar

    document.getElementById('adminUsername').value = '';

    document.getElementById('adminPassword').value = '';

    // Ocultar mensaje de error

    const errorElement = document.getElementById('credentialsError');

    if (errorElement) {

      errorElement.style.display = 'none';

    }

    hideModal('adminCredentialsModal');

    // Ejecutar la acción pendiente

    if (typeof pendingAction === 'function') {

      // Si es un callback, ejecutarlo

      pendingAction();

    } else if (pendingAction === 'addPersonnel') {

      showAddPersonnelModal();

    } else if (pendingAction === 'editData') {

      showEditDataModal();

    }

    // Limpiar la acción pendiente

    pendingAction = null;

  } else {

    // Mostrar mensaje de error en el modal

    const errorElement = document.getElementById('credentialsError');

    if (errorElement) {

      errorElement.style.display = 'block';

    } else {

      showErrorMessage('Credenciales incorrectas');

    }

  }

}

// Función para mostrar mensaje de éxito (mejorada con notificaciones personalizadas)
function showSuccessMessage(message) {
  // Crear elemento de mensaje con clase success-notification (igual que en comunidades.js)
  const messageElement = document.createElement('div');
  messageElement.className = 'success-notification';
  messageElement.textContent = message;
  
  // Agregar al body
  document.body.appendChild(messageElement);
  
  // Remover después de 3 segundos
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.remove();
    }
  }, 3000);
}

// Función para mostrar mensaje de error (mejorada con notificaciones personalizadas)
function showErrorMessage(message) {
  // Crear elemento de mensaje con clase error-notification (igual que en comunidades.js)
  const messageElement = document.createElement('div');
  messageElement.className = 'error-notification';
  messageElement.textContent = message;
  
  // Agregar al body
  document.body.appendChild(messageElement);
  
  // Remover después de 3 segundos
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.remove();
    }
  }, 3000);
}

// Función para mostrar modal de confirmación personalizado (reemplaza confirm())
let pendingConfirmAction = null;
// Variable global para rastrear si el modal de confirmación está abierto
let isConfirmModalOpen = false;
// Interval para asegurar que los botones siempre estén habilitados cuando el modal está abierto
let confirmModalProtectionInterval = null;

function showConfirmModal(message, onConfirm, onCancel = null, confirmText = null, confirmClass = null) {
  const confirmModal = document.getElementById('confirmDeleteModal');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  
  if (!confirmModal || !confirmMessage) {
    if (confirm(message)) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
    return;
  }
  
  confirmMessage.textContent = message;
  pendingConfirmAction = { onConfirm, onCancel };
  isConfirmModalOpen = true;
  
  // Personalizar texto y clase del botón de confirmación
  if (confirmDeleteBtn) {
    if (confirmText) {
      confirmDeleteBtn.textContent = confirmText;
    } else {
      confirmDeleteBtn.textContent = 'Eliminar';
    }
    if (confirmClass) {
      confirmDeleteBtn.className = confirmClass;
    } else {
      confirmDeleteBtn.className = 'btn-danger';
    }
  }
  
  // Función para asegurar que los botones estén siempre habilitados
  const ensureButtonsEnabled = () => {
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const closeConfirmModal = document.getElementById('closeConfirmModal');
    
    if (!isConfirmModalOpen) {
      // Si el modal está cerrado, detener la protección
      if (confirmModalProtectionInterval) {
        clearInterval(confirmModalProtectionInterval);
        confirmModalProtectionInterval = null;
      }
      return;
    }
    
    // Forzar habilitación de botones
    // NOTA: Se eliminó el Object.defineProperty que redefinía la propiedad
    // 'disabled' del DOM de forma persistente. Esto provocaba que cualquier
    // intento posterior de hacer btn.disabled = true fuera ignorado, dejando
    // al botón en estados visuales inconsistentes (mezcla de disabled=false
    // con display:none) que en algunos navegadores bloqueaba la propagación
    // de clicks. Ahora simplemente se hace un reset directo de estilos.
    if (confirmDeleteBtn) {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.style.pointerEvents = 'auto';
      confirmDeleteBtn.style.opacity = '1';
      confirmDeleteBtn.style.cursor = 'pointer';
      confirmDeleteBtn.style.userSelect = 'auto';
      confirmDeleteBtn.removeAttribute('aria-disabled');
      confirmDeleteBtn.classList.remove('disabled', 'is-hidden-by-permissions');
    }

    if (cancelDeleteBtn) {
      cancelDeleteBtn.disabled = false;
      cancelDeleteBtn.style.pointerEvents = 'auto';
      cancelDeleteBtn.style.opacity = '1';
      cancelDeleteBtn.style.cursor = 'pointer';
      cancelDeleteBtn.style.userSelect = 'auto';
      cancelDeleteBtn.removeAttribute('aria-disabled');
      cancelDeleteBtn.classList.remove('disabled', 'is-hidden-by-permissions');
    }
    
    if (closeConfirmModal) {
      closeConfirmModal.disabled = false;
      closeConfirmModal.style.pointerEvents = 'auto';
      closeConfirmModal.style.opacity = '1';
      closeConfirmModal.style.cursor = 'pointer';
    }
    
    // Asegurar que el modal y su contenido tengan pointer-events habilitado
    if (confirmModal) {
      confirmModal.style.pointerEvents = 'auto';
      confirmModal.classList.add('active');
    }
    
    const modalContent = confirmModal?.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.pointerEvents = 'auto';
    }
    
    const modalFooter = confirmModal?.querySelector('.modal-footer');
    if (modalFooter) {
      modalFooter.style.pointerEvents = 'auto';
    }
  };
  
  // Ejecutar inmediatamente
  ensureButtonsEnabled();
  
  // Crear intervalo de protección con verificación de que el modal sigue abierto
  if (confirmModalProtectionInterval) {
    clearInterval(confirmModalProtectionInterval);
  }
  confirmModalProtectionInterval = setInterval(() => {
    if (!isConfirmModalOpen || !confirmModal || confirmModal.style.display === 'none' || !confirmModal.classList.contains('active')) {
      _stopConfirmModalProtection();
      return;
    }
    ensureButtonsEnabled();
  }, 300);
  
  showModal('confirmDeleteModal');
  
  // Verificación final después de mostrar el modal con múltiples intentos
  [50, 150, 300].forEach(delay => {
    setTimeout(ensureButtonsEnabled, delay);
  });
}

// Helper para detener el interval de protección del modal de confirmación.
// Se llama SIEMPRE en finally para evitar que el interval quede huérfano
// (lo que provocaba que la UI se sintiera lenta y los clicks no respondieran).
function _stopConfirmModalProtection() {
  if (confirmModalProtectionInterval) {
    clearInterval(confirmModalProtectionInterval);
    confirmModalProtectionInterval = null;
  }
}

// Helper para reiniciar el interval tras un error (mantiene los botones
// protegidos mientras el modal sigue abierto).
function _restartConfirmModalProtection() {
  _stopConfirmModalProtection();
  const ensureButtonsEnabled = () => {
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.disabled = false;
    if (cancelDeleteBtn) cancelDeleteBtn.disabled = false;
  };
  confirmModalProtectionInterval = setInterval(ensureButtonsEnabled, 100);
  ensureButtonsEnabled();
}

// Función para ejecutar acción de confirmación
async function executeConfirmAction(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Marcar que el modal ya no está abierto para la protección y limpiar
  // el interval SIEMPRE (incluso si la acción lanza excepción) para evitar
  // intervals huérfanos que bloqueen el ciclo de eventos del navegador.
  isConfirmModalOpen = false;
  let hadPendingAction = false;

  try {
    if (pendingConfirmAction && pendingConfirmAction.onConfirm) {
      hadPendingAction = true;
      const action = pendingConfirmAction.onConfirm;
      pendingConfirmAction = null;

      // Ejecutar la acción y esperar a que termine (puede ser async)
      const result = action();
      if (result && typeof result.then === 'function') {
        await result;
      }
      // Cerrar el modal después de que la acción se complete exitosamente
      hideModal('confirmDeleteModal');
    } else {
      // Si no hay acción pendiente, solo cerrar el modal
      hideModal('confirmDeleteModal');
    }
  } catch (error) {
    console.error('Error al ejecutar acción de confirmación:', error);
    showErrorMessage(error.message || 'Error al ejecutar la acción. Por favor, intenta de nuevo.');
    // Re-abrir el modal en caso de error para que el usuario pueda intentar de nuevo o cancelar
    isConfirmModalOpen = true;
    // Re-iniciar la protección para que los botones queden forzados a enabled
    _restartConfirmModalProtection();
  } finally {
    // Solo limpiamos el interval si NO hubo error (en el catch ya se reinició).
    if (!isConfirmModalOpen) {
      _stopConfirmModalProtection();
    }
  }

  // Suprimir warning de variable no usada
  void hadPendingAction;
}

// Función para cancelar acción de confirmación
function cancelConfirmAction(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  isConfirmModalOpen = false;

  try {
    if (pendingConfirmAction && pendingConfirmAction.onCancel) {
      pendingConfirmAction.onCancel();
    }
    pendingConfirmAction = null;
    hideModal('confirmDeleteModal');
  } finally {
    // SIEMPRE limpiar el interval, incluso si onCancel() lanza.
    _stopConfirmModalProtection();
  }
}

// Helper global para cerrar cualquier modal abierto. Se usa como red de
// seguridad cuando un error no controlado deja un modal con .active y
// pointer-events: auto, lo que bloquea TODA la página.
function closeAllModals() {
  try {
    document.querySelectorAll('.modal.active').forEach((m) => m.classList.remove('active'));
    document.body.style.overflow = '';
  } catch (e) {
    console.warn('No se pudieron cerrar todos los modales:', e);
  }
  // También limpiar interval de protección si quedó vivo.
  if (typeof _stopConfirmModalProtection === 'function') {
    _stopConfirmModalProtection();
  }
}

// Función para actualizar el proyecto actual en tiempo real (similar a refreshCurrentCommunity)
async function refreshCurrentProject(successMessage = null) {
  if (!currentProjectData || !currentProjectData.id) {
    return;
  }
  
  try {
    // Recargar los datos del proyecto desde el servidor
    const updated = await loadProjectDetails(currentProjectData.id);
    
    if (updated) {
      // Actualizar la vista actual sin recargar toda la página
      // mostrarDetalleProyecto ya se llama dentro de loadProjectDetails
      // Solo necesitamos actualizar los elementos si estamos en la vista de detalle
      
      const detailView = document.getElementById('projectDetailView');
      if (detailView && detailView.style.display !== 'block') {
        // Si no estamos en la vista de detalle, no necesitamos hacer nada más
        return;
      }
      
      // Si hay un mensaje de éxito, mostrarlo
      if (successMessage) {
        showSuccessMessage(successMessage);
      }
      
      // Actualizar la sección de "Últimos Proyectos" SIEMPRE después de hacer cambios
      // Esto asegura que cuando se crea o actualiza un proyecto, aparezca en la lista
      // Verificar si el contenedor existe en el DOM (puede estar oculto pero debe existir)
      const latestProjectsContainer = document.querySelector('.latest-projects .projects-grid.featured');
      if (latestProjectsContainer) {
        // Actualizar con un pequeño delay para asegurar que el backend haya actualizado actualizado_en
        setTimeout(() => {
          refreshLatestProjectsFromServer();
        }, 500);  // Esperar 500ms para que el backend actualice actualizado_en
      }
    }
  } catch (error) {
    showErrorMessage(error.message || 'No se pudo actualizar la información del proyecto.');
  }
}

function openCommunityInlinePanel({ hostCard, community, regionId, description }) {
  closeCommunityInlinePanel(hostCard);

  const panelDescriptionRaw =
    description ||
    community.description ||
    community.detail ||
    community.descripcion ||
    community.descripcion_general ||
    '';
  const panelDescription = typeof panelDescriptionRaw === 'string' ? panelDescriptionRaw.trim() : '';
  const hasPanelDescription = Boolean(panelDescription);
  let panelDateHtml = '';
  if (community.agregado_en) {
    const fechaDetail = new Date(community.agregado_en);
    if (!Number.isNaN(fechaDetail.getTime())) {
      const fechaTexto = fechaDetail.toLocaleDateString('es-GT', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
      });
      panelDateHtml = `<p class="community-inline-panel__date">Agregada el ${escapeHtml(fechaTexto)}</p>`;
    }
  }

  const panel = document.createElement('div');
  panel.className = 'community-inline-panel';
  panel.innerHTML = `
    <div class="community-inline-panel__content">
      <header class="community-inline-panel__header">
        <div class="community-inline-panel__title-group">
          <h3>${escapeHtml(community.name)}</h3>
          <p>${escapeHtml(community.region || 'Sin región asignada')}</p>
          ${panelDateHtml}
        </div>
        <button type="button" class="community-inline-panel__close" aria-label="Cerrar panel">×</button>
      </header>

      <section class="community-inline-panel__body">
        ${
          hasPanelDescription
            ? `
        <div class="community-inline-panel__description">
          <h4>Descripción</h4>
          <p>${escapeHtml(panelDescription)}</p>
        </div>
        `
            : ''
        }
        <div class="community-inline-panel__actions">
          <button type="button" class="btn-secondary community-inline-panel__action" data-region-id="${regionId || ''}">
            Ver región
          </button>
          <button type="button" class="btn-primary community-inline-panel__action" data-community-id="${community.id || ''}">
            Ver comunidad
          </button>
        </div>
      </section>
    </div>
  `;

  hostCard.classList.add('is-open');
  hostCard.appendChild(panel);

  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  panel.querySelector('.community-inline-panel__close').addEventListener('click', (event) => {
    event.stopPropagation();
    closeCommunityInlinePanel(hostCard);
  });

  panel.querySelectorAll('.community-inline-panel__action').forEach((actionBtn) => {
    actionBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const regionTarget = actionBtn.getAttribute('data-region-id');
      const communityTarget = actionBtn.getAttribute('data-community-id');

      closeCommunityInlinePanel(hostCard);

      if (regionTarget) {
        await navigateToRegion(regionTarget);
      } else if (communityTarget) {
        await navigateToCommunity(communityTarget);
      }
    });
  });
}

function closeCommunityInlinePanel(card) {
  if (!card) return;
  card.classList.remove('is-open');
  const panel = card.querySelector('.community-inline-panel');
  if (panel) {
    panel.remove();
  }
}

function showCommunityDetailPanel({ communityId, regionId, communities }) {
  const community = communities.find((item) => item.id === communityId);
  if (!community) {
    showErrorMessage('No se encontró información de la comunidad.');
    return;
  }

  const targetCard = document.querySelector(`.location-item--community[data-community-id="${communityId}"]`);

  if (targetCard) {
    const descriptionText = targetCard.dataset.description || community.description || community.detail || 'No hay descripción disponible para esta comunidad.';

    openCommunityInlinePanel({
      hostCard: targetCard,
      community,
      regionId,
      description: descriptionText,
    });
    targetCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function redirectToDetailPage({ storageKey, queryParam, targetId, pathname }) {
  if (!targetId) {
    return;
  }

  const targetValue = String(targetId).trim();
  if (!targetValue) {
    return;
  }

  try {
    if (typeof window.sessionStorage !== 'undefined') {
      const payload = JSON.stringify({ id: targetValue, timestamp: Date.now() });
      window.sessionStorage.setItem(storageKey, payload);
    }
  } catch (storageError) {
  }

  try {
    const targetUrl = new URL(pathname, window.location.origin);
    if (queryParam) {
      targetUrl.searchParams.set(queryParam, targetValue);
    }
    window.location.href = targetUrl.toString();
  } catch (urlError) {
    const querySuffix = queryParam ? `?${encodeURIComponent(queryParam)}=${encodeURIComponent(targetValue)}` : '';
    window.location.href = `${pathname}${querySuffix}`;
  }
}

async function navigateToRegion(regionId) {
  const normalizedId = regionId !== undefined && regionId !== null ? String(regionId).trim() : '';

  if (!normalizedId) {
    showErrorMessage('No se encontró la región asociada a esta comunidad.');
    return;
  }

  try {
    if (typeof window.showRegionDetail === 'function') {
      await window.showRegionDetail(normalizedId);
      return;
    }
  } catch (error) {
  }

  redirectToDetailPage({
    storageKey: 'pendingRegionDetail',
    queryParam: 'region',
    targetId: normalizedId,
    pathname: '/regiones/',
  });
}

async function navigateToCommunity(communityId) {
  const normalizedId = communityId !== undefined && communityId !== null ? String(communityId).trim() : '';

  if (!normalizedId) {
    showErrorMessage('No se encontró la comunidad seleccionada.');
    return;
  }

  try {
    if (typeof window.showCommunityDetail === 'function') {
      await window.showCommunityDetail(normalizedId);
      return;
    }
  } catch (error) {
  }

  redirectToDetailPage({
    storageKey: 'pendingCommunityDetail',
    queryParam: 'community',
    targetId: normalizedId,
    pathname: '/comunidades/',
  });
}

// Función para cargar personal en la vista detallada

function loadPersonnelInfo(personnel) {

  const container = document.getElementById('detailPersonnelInfo');

  if (!container) return;

  container.innerHTML = '';

  personnel.forEach(person => {

    const personnelItem = document.createElement('div');

    personnelItem.className = 'personnel-item';

    personnelItem.innerHTML = `

      <div class="personnel-info">

        <h4 class="personnel-name">${person.name}</h4>

        <p class="personnel-role">${person.role}</p>

      </div>

      <button class="btn-remove-item" data-personnel-id="${person.id}">

        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

          <line x1="18" y1="6" x2="6" y2="18"></line>

          <line x1="6" y1="6" x2="18" y2="18"></line>

        </svg>

      </button>

    `;

    container.appendChild(personnelItem);

  });

}

// Función para cargar galería con descripciones

function loadGalleryWithDescriptions(gallery) {

  const container = document.getElementById('detailGallery');

  if (!container) return;

  container.innerHTML = '';

  gallery.forEach((image, index) => {

    const imageItem = document.createElement('div');

    imageItem.className = 'gallery-item';

    imageItem.innerHTML = `

      <img src="${image.url}" alt="${image.description}" loading="lazy" onclick="openImageModal('${image.url}')">

      <div class="image-description">${image.description}</div>

      <button class="btn-remove-item" data-image-index="${index}">

        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

          <line x1="18" y1="6" x2="6" y2="18"></line>

          <line x1="6" y1="6" x2="18" y2="18"></line>

        </svg>

      </button>

    `;

    container.appendChild(imageItem);

  });

}

// Normalizar datos de comunidades provenientes de distintas fuentes

function normalizeCommunitiesData(rawList) {
  if (!Array.isArray(rawList)) {
    return [];
  }

  const seenKeys = new Set();
  const normalized = [];

  rawList.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const regionObject = item.region && typeof item.region === 'object' ? item.region : null;

    const regionName =
      item.region_nombre ||
      item.region_name ||
      (regionObject && (regionObject.nombre || regionObject.name)) ||
      (typeof item.region === 'string' ? item.region : '');

    const regionSede =
      item.region_sede ||
      (regionObject &&
        (regionObject.sede ||
          regionObject.location ||
          regionObject.descripcion ||
          regionObject.detail)) ||
      (typeof item.sede === 'string' ? item.sede : '');

    const regionText =
      regionName && regionSede
        ? `${regionName} — ${regionSede}`
        : regionName || regionSede || '';

    const descriptionText =
      item.description ||
      item.descripcion ||
      item.detalle ||
      item.detail ||
      item.descripcion_general ||
      '';

    const normalizedItem = {
      ...item,
      id: item.id ?? item.comunidad_id ?? item.community_id ?? item.uuid ?? item.pk ?? '',
      name:
        item.name ??
        item.nombre ??
        item.comunidad_nombre ??
        item.community_name ??
        'Comunidad sin nombre',
      // También mantener el nombre original para compatibilidad
      nombre: item.nombre ?? item.comunidad_nombre ?? item.name ?? 'Comunidad sin nombre',
      comunidad_nombre: item.comunidad_nombre ?? item.nombre ?? item.name ?? 'Comunidad sin nombre',
      region:
        regionText ||
        (typeof item.region === 'string' ? item.region : '') ||
        (typeof item.type === 'string' ? item.type : '') ||
        'Sin región asignada',
      region_id: item.region_id ?? (regionObject && (regionObject.id || regionObject.pk)) ?? '',
      region_nombre: (item.region_nombre ?? regionName) || 'Sin región asignada',
      region_sede: (item.region_sede ?? regionSede) || '',
      description: descriptionText,
      agregado_en: item.agregado_en || item.creado_en || item.created_at || null,
    };

    if (typeof normalizedItem.name === 'string') {
      normalizedItem.name = normalizedItem.name.trim() || 'Comunidad sin nombre';
    }

    if (typeof normalizedItem.region === 'string') {
      normalizedItem.region = normalizedItem.region.trim() || 'Sin región asignada';
    } else {
      normalizedItem.region = 'Sin región asignada';
    }

    const uniqueKey = normalizedItem.id || normalizedItem.name;

    if (uniqueKey && seenKeys.has(uniqueKey)) {
      return;
    }

    if (uniqueKey) {
      seenKeys.add(uniqueKey);
    }

    normalized.push(normalizedItem);
  });

  return normalized;
}

// Función para cargar comunidades

function loadCommunities(communities) {
  const container = document.getElementById('detailCommunities');

  if (!container) return;

  container.innerHTML = '';

  const communitiesList = Array.isArray(communities) ? communities : [];

  if (!communitiesList.length) {
    container.innerHTML = `
      <div class="communities-empty">
        <p>No hay comunidades registradas para este proyecto.</p>
      </div>
    `;
    return;
  }

  communitiesList.forEach((community) => {
    const card = document.createElement('div');
    card.className = 'location-item location-item--community';

    const descriptionText =
      community.description ||
      community.detail ||
      community.descripcion ||
      community.descripcion_general ||
      '';
    card.dataset.communityId = community.id || '';
    card.dataset.description = descriptionText;
    card.dataset.regionId = community.region_id || '';

    const regionLabel = escapeHtml(community.region || 'Sin región asignada');
    const communityName = escapeHtml(community.name || 'Comunidad sin nombre');
    const hasDescription = Boolean(community.description && community.description.trim());
    let fechaHtml = '';
    if (community.agregado_en) {
      const fecha = new Date(community.agregado_en);
      if (!Number.isNaN(fecha.getTime())) {
        const fechaTexto = fecha.toLocaleDateString('es-GT', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        });
        fechaHtml = `<p class="location-card-date">Agregada el ${escapeHtml(fechaTexto)}</p>`;
      }
    }

    card.innerHTML = `
      <div class="location-card-main">
      <div class="location-icon">📍</div>
      <div class="location-content">
          <h4>${communityName}</h4>
          <p class="location-card-region">${regionLabel}</p>
          ${fechaHtml}
        </div>
      </div>
      ${hasDescription ? `<p class="location-card-description">${escapeHtml(descriptionText)}</p>` : ''}
    `;

    const openPanel = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (card.classList.contains('is-open')) {
        closeCommunityInlinePanel(card);
        return;
      }

      container.querySelectorAll('.location-item--community.is-open').forEach((openCard) => {
        if (openCard !== card) {
          closeCommunityInlinePanel(openCard);
        }
      });

      openCommunityInlinePanel({
        hostCard: card,
        community,
        regionId: community.region_id || '',
        description: descriptionText,
      });
    };

    card.addEventListener('click', openPanel);

    container.appendChild(card);
  });
}
// Función para renderizar cambios desde la API

async function renderCambios(cambios) {

  const container = document.getElementById('detailChanges');

  if (!container) {

    const altContainer = document.querySelector('#detailChanges');

    return;

  }

  container.innerHTML = '';

  if (!cambios || cambios.length === 0) {

    container.innerHTML = '<p style="color: #6c757d;">No hay cambios registrados para este proyecto.</p>';

    return;

  }

  // Verificar si el usuario puede gestionar (admin o personal)

  const puedeGestionar = puedeGestionarGaleria();

  // Cargar datos de colaboradores y comunidades desde IndexedDB si están disponibles
  const db = getOfflineDB();
  let colaboradoresMap = new Map();
  let comunidadesMap = new Map();

  if (db) {
    try {
      // Cargar colaboradores desde IndexedDB
      const colaboradores = await db.getAll('colaboradores');
      if (colaboradores && colaboradores.length > 0) {
        colaboradores.forEach(col => {
          colaboradoresMap.set(String(col.id), col.nombre || col.nombres || 'Sin nombre');
        });
      }

      // Cargar comunidades desde IndexedDB
      const comunidades = await db.getAll('comunidades');
      if (comunidades && comunidades.length > 0) {
        comunidades.forEach(com => {
          comunidadesMap.set(String(com.id), com.nombre || 'Sin nombre');
        });
      }
    } catch (error) {
      console.warn('⚠️ Error al cargar datos desde IndexedDB para renderizar cambios:', error);
    }
  }

  // Agrupar cambios por mes-año con un separador visual.
  // Se asume que el backend ya ordena por fecha_cambio descendente.
  const monthFormatter = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric' });
  let currentMonthKey = null;

  for (const cambio of cambios) {
    // Insertar separador de mes cuando cambia el grupo mes-año
    try {
      const iso = cambio.fecha_cambio ? String(cambio.fecha_cambio) : '';
      const dateMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const monthKey = `${dateMatch[1]}-${dateMatch[2]}`;
        if (monthKey !== currentMonthKey) {
          currentMonthKey = monthKey;
          // Crear fecha local con año/mes/dia del string para formatear el nombre del mes
          const year = parseInt(dateMatch[1], 10);
          const monthIndex = parseInt(dateMatch[2], 10) - 1;
          const labelDate = new Date(year, monthIndex, 1);
          const monthLabel = monthFormatter.format(labelDate);
          const monthHeader = document.createElement('div');
          monthHeader.className = 'changes-month-header';
          monthHeader.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
          container.appendChild(monthHeader);
        }
      }
    } catch (e) {
      // Si no se puede parsear la fecha, simplemente no se muestra el separador
    }

    // Obtener el texto de comunidades
    let comunidadesTexto = '';
    if (cambio.comunidades && typeof cambio.comunidades === 'string' && cambio.comunidades.trim() !== '') {
      comunidadesTexto = cambio.comunidades.trim();
    } else if (cambio.comunidades_nombres && typeof cambio.comunidades_nombres === 'string' && cambio.comunidades_nombres.trim() !== '') {
      comunidadesTexto = cambio.comunidades_nombres.trim();
    } else if (cambio.comunidades_ids && Array.isArray(cambio.comunidades_ids) && cambio.comunidades_ids.length > 0) {
      // Si solo tenemos IDs, buscar los nombres desde IndexedDB
      const nombresComunidades = cambio.comunidades_ids
        .map(id => comunidadesMap.get(String(id)))
        .filter(nombre => nombre)
        .join(', ');
      if (nombresComunidades) {
        comunidadesTexto = nombresComunidades;
      }
    }

    // Obtener el texto de responsables
    let responsablesTexto = '';
    if (cambio.responsables_display && typeof cambio.responsables_display === 'string' && cambio.responsables_display.trim() !== '') {
      responsablesTexto = cambio.responsables_display.trim();
    } else if (cambio.responsable && typeof cambio.responsable === 'string' && cambio.responsable.trim() !== '') {
      responsablesTexto = cambio.responsable.trim();
    } else if (cambio.colaboradores_ids && Array.isArray(cambio.colaboradores_ids) && cambio.colaboradores_ids.length > 0) {
      // Si solo tenemos IDs, buscar los nombres desde IndexedDB
      const nombresColaboradores = cambio.colaboradores_ids
        .map(id => colaboradoresMap.get(String(id)))
        .filter(nombre => nombre)
        .join(', ');
      if (nombresColaboradores) {
        responsablesTexto = nombresColaboradores;
      }
    }

    const changeItem = document.createElement('div');

    changeItem.className = 'change-item clickable';

    changeItem.setAttribute('data-cambio-id', cambio.id);
    if (cambio.grupo_id) {
      changeItem.setAttribute('data-grupo-id', cambio.grupo_id);
    }

    // Indicador de cambio offline
    const offlineBadge = cambio.es_offline ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; margin-left: 6px;">OFFLINE</span>' : '';
    
    changeItem.innerHTML = `
      <div class="change-content">
        <div class="change-date">${cambio.fecha_display || (cambio.fecha_cambio ? new Date(cambio.fecha_cambio).toLocaleString('es-GT', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha')}${offlineBadge}</div>
        <div class="change-description">${cambio.descripcion || 'Sin descripción'}</div>
        <div class="change-personnel">Por: ${responsablesTexto || 'Sin responsable'}</div>
        ${comunidadesTexto ? 
          `<div class="change-communities" style="margin-top: 8px; color: #0ea5e9; font-size: 0.9rem; display: block !important; visibility: visible !important; opacity: 1 !important;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            Trabajado en: ${escapeHtml(comunidadesTexto)}
          </div>` : 
          ''
        }
        ${cambio.evidencias && cambio.evidencias.length > 0 ? 
          `<div class="change-evidences-count">${cambio.evidencias.length} evidencia(s)</div>` : 
          '<div class="change-evidences-count">Sin evidencias</div>'
        }
      </div>

      ${puedeGestionar ? `

      <div style="display: flex; gap: 8px;">

        <button class="btn-edit-item" data-cambio-id="${cambio.id}" title="Editar cambio" style="background: rgba(0, 123, 255, 0.9); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">

          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>

            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>

          </svg>

          Editar

        </button>

        <button class="btn-delete-item" data-cambio-id="${cambio.id}" title="Eliminar cambio" style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">

          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

            <line x1="18" y1="6" x2="6" y2="18"></line>

            <line x1="6" y1="6" x2="18" y2="18"></line>

          </svg>

          Eliminar

        </button>

      </div>

      ` : ''}

    `;

    container.appendChild(changeItem);

    // Agregar event listeners directamente a los botones si el usuario tiene permisos

    if (puedeGestionar) {

      const editBtn = changeItem.querySelector('.btn-edit-item');

      const deleteBtn = changeItem.querySelector('.btn-delete-item');

      if (editBtn) {

        editBtn.addEventListener('click', function(e) {

          e.stopPropagation();

          e.preventDefault();

          editarCambio(cambio.id, cambio);

        });

      }

      if (deleteBtn) {

        deleteBtn.addEventListener('click', function(e) {

          e.stopPropagation();

          e.preventDefault();

          confirmarEliminarCambio(cambio.id, cambio);

        });

      }

      // Event listener para mostrar detalles al hacer clic en el cambio (solo para usuarios autenticados)

      changeItem.addEventListener('click', function(e) {

        // Solo mostrar detalles si no se hizo clic en un botón

        if (!e.target.closest('.btn-edit-item') && !e.target.closest('.btn-delete-item')) {

          showChangeDetailsModal(cambio);

        }

      });

    } else {

      // Si no tiene permisos, NO agregar event listener de clic y remover clase clickable

      changeItem.classList.remove('clickable');

      changeItem.style.cursor = 'default';

      changeItem.style.opacity = '0.9';

      changeItem.title = 'Debes iniciar sesión como admin o personal para ver detalles del cambio';

    }

  }

}
// Función para mostrar modal de imagen en tamaño completo

// Estado del lightbox de imagen
let imageViewCurrentIndex = -1;
let imageViewSourceImages = [];

function showImageViewModal(imageUrl, imageDescription = '') {
  // Si tenemos galeria cargada, intentar encontrar el indice
  if (Array.isArray(currentProjectGalleryImages) && currentProjectGalleryImages.length > 0) {
    const foundIndex = currentProjectGalleryImages.findIndex(img => {
      const imgUrl = img.url || (img.base64 ? `data:${img.tipo || 'image/jpeg'};base64,${img.base64}` : '');
      return imgUrl === imageUrl;
    });
    if (foundIndex !== -1) {
      openGalleryLightbox(foundIndex);
      return;
    }
  }

  // Fallback: mostrar imagen aislada sin navegacion
  imageViewCurrentIndex = -1;
  imageViewSourceImages = [];
  _renderImageView(imageUrl, imageDescription, false, false);
}

function openGalleryLightbox(startIndex) {
  if (!Array.isArray(currentProjectGalleryImages) || currentProjectGalleryImages.length === 0) {
    return;
  }
  if (startIndex < 0 || startIndex >= currentProjectGalleryImages.length) {
    return;
  }
  imageViewSourceImages = currentProjectGalleryImages;
  imageViewCurrentIndex = startIndex;
  _updateImageViewFromCurrentIndex();
}

function _updateImageViewFromCurrentIndex() {
  const img = imageViewSourceImages[imageViewCurrentIndex];
  if (!img) return;
  const imageUrl = img.url || (img.base64 ? `data:${img.tipo || 'image/jpeg'};base64,${img.base64}` : '');
  const imageDescription = img.descripcion || '';
  const hasPrev = imageViewCurrentIndex > 0;
  const hasNext = imageViewCurrentIndex < imageViewSourceImages.length - 1;
  _renderImageView(imageUrl, imageDescription, hasPrev, hasNext, img.id);
}

function _renderImageView(imageUrl, imageDescription, hasPrev, hasNext, imageId = null) {
  const modal = document.getElementById('imageViewModal');
  const fullSizeImage = document.getElementById('fullSizeImage');
  const imageViewDescription = document.getElementById('imageViewDescription');
  const prevBtn = document.getElementById('lightboxPrevBtn');
  const nextBtn = document.getElementById('lightboxNextBtn');
  const editDescBtn = document.getElementById('btnEditImageDescription');
  const setCoverBtn = document.getElementById('btnSetAsCover');

  if (!modal || !fullSizeImage) return;

  fullSizeImage.src = imageUrl;
  fullSizeImage.alt = imageDescription || 'Imagen en tamaño completo';
  imageViewDescription.textContent = imageDescription || '';

  if (prevBtn) {
    prevBtn.disabled = !hasPrev;
    prevBtn.style.display = imageViewSourceImages.length > 1 ? 'flex' : 'none';
  }
  if (nextBtn) {
    nextBtn.disabled = !hasNext;
    nextBtn.style.display = imageViewSourceImages.length > 1 ? 'flex' : 'none';
  }

  // Solo mostrar acciones de gestion si el usuario puede gestionar y tenemos un ID real
  const puedeGestionar = imageId && currentProjectGalleryCanManage;
  if (editDescBtn) {
    editDescBtn.style.display = puedeGestionar ? 'inline-flex' : 'none';
    editDescBtn.dataset.imageId = imageId || '';
  }
  if (setCoverBtn) {
    setCoverBtn.style.display = puedeGestionar ? 'inline-flex' : 'none';
    setCoverBtn.dataset.imageId = imageId || '';
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function imageViewNavigate(direction) {
  if (!imageViewSourceImages.length) return;
  const newIndex = imageViewCurrentIndex + direction;
  if (newIndex >= 0 && newIndex < imageViewSourceImages.length) {
    imageViewCurrentIndex = newIndex;
    _updateImageViewFromCurrentIndex();
  }
}

// Función para cerrar modal de imagen
function closeImageViewModal() {
  const modal = document.getElementById('imageViewModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  imageViewCurrentIndex = -1;
  imageViewSourceImages = [];
}

// Función para mostrar modal de agregar imagen

function showAddImageModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  showModal('addImageModal');

  clearImageForm();

}

// Función para limpiar formulario de imagen

function clearImageForm() {
  const fileInput = document.getElementById('imageFileInput');
  if (fileInput) {
    fileInput.value = '';
  }
  pendingProjectGalleryImages.forEach(revokePendingImagePreview);
  pendingProjectGalleryImages = [];
  renderPendingProjectImages();
}

function renderPendingProjectImages() {
  
  const previewContainer = document.getElementById('imagePreview');
  
  if (!previewContainer) {
    return;
  }

  previewContainer.innerHTML = '';

  if (!pendingProjectGalleryImages.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'image-preview-empty';
    emptyState.textContent = 'No has seleccionado imágenes.';
    previewContainer.appendChild(emptyState);
    return;
  }

  pendingProjectGalleryImages.forEach((item, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item';
    wrapper.dataset.index = index;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'image-preview-remove';
    removeBtn.dataset.index = index;
    removeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetIndex = parseInt(removeBtn.dataset.index || '', 10);
      if (!Number.isNaN(targetIndex)) {
        const removedItems = pendingProjectGalleryImages.splice(targetIndex, 1);
        removedItems.forEach(revokePendingImagePreview);
        renderPendingProjectImages();
      }
    });

    const img = document.createElement('img');
    img.src = item.previewUrl || '';
    img.alt = 'Vista previa de la imagen seleccionada';
    img.loading = 'lazy';
    img.style.pointerEvents = 'none';

    const descriptionWrapper = document.createElement('div');
    descriptionWrapper.className = 'image-preview-description';

    const descriptionInput = document.createElement('textarea');
    descriptionInput.className = 'image-description-input';
    descriptionInput.dataset.index = index;
    descriptionInput.placeholder = 'Agrega una descripción...';
    descriptionInput.rows = 2;
    descriptionInput.value = item.description || '';

    descriptionInput.addEventListener('input', () => {
      const targetIndex = parseInt(descriptionInput.dataset.index || '', 10);
      if (!Number.isNaN(targetIndex) && pendingProjectGalleryImages[targetIndex]) {
        pendingProjectGalleryImages[targetIndex].description = descriptionInput.value;
      }
    });

    descriptionWrapper.appendChild(descriptionInput);

    wrapper.appendChild(removeBtn);
    wrapper.appendChild(img);
    wrapper.appendChild(descriptionWrapper);
    previewContainer.appendChild(wrapper);
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderProjectGalleryImages(images, puedeGestionar) {
  currentProjectGalleryImages = Array.isArray(images) ? images : [];
  currentProjectGalleryCanManage = !!puedeGestionar;

  const totalPages = Math.ceil(currentProjectGalleryImages.length / PROJECT_GALLERY_PAGE_SIZE);
  if (totalPages === 0) {
    currentProjectGalleryPage = 0;
  } else if (currentProjectGalleryPage >= totalPages) {
    currentProjectGalleryPage = totalPages - 1;
  } else if (currentProjectGalleryPage < 0) {
    currentProjectGalleryPage = 0;
  }

  renderProjectGalleryPage();
}

function renderProjectGalleryPage() {
  const detailGallery = document.getElementById('detailGallery');

  if (!detailGallery) {
    return;
  }

  detailGallery.classList.toggle('gallery-can-manage', currentProjectGalleryCanManage);

  if (!currentProjectGalleryImages.length) {
    detailGallery.innerHTML = '<p class="gallery-empty-state">No hay imágenes disponibles.</p>';
    return;
  }

  const totalPages = Math.ceil(currentProjectGalleryImages.length / PROJECT_GALLERY_PAGE_SIZE);
  if (totalPages === 0) {
    currentProjectGalleryPage = 0;
  } else if (currentProjectGalleryPage >= totalPages) {
    currentProjectGalleryPage = totalPages - 1;
  } else if (currentProjectGalleryPage < 0) {
    currentProjectGalleryPage = 0;
  }

  const startIndex = currentProjectGalleryPage * PROJECT_GALLERY_PAGE_SIZE;
  const visibleImages = currentProjectGalleryImages.slice(startIndex, startIndex + PROJECT_GALLERY_PAGE_SIZE);

  const itemsHtml = visibleImages.map((img) => {
    const descriptionText = escapeHtml(img.descripcion || '');
    const descriptionHtml = descriptionText
      ? `<div class="gallery-item-description">${descriptionText}</div>`
      : '';
    const encodedName = encodeURIComponent(img.nombre || img.archivo_nombre || '');
    
    // Manejar imágenes offline: si tiene base64 pero no url, crear data URL
    let imageUrlAttr = img.url || '';
    if (!imageUrlAttr && img.base64) {
      const mimeType = img.tipo || img.archivo_tipo || 'image/jpeg';
      imageUrlAttr = `data:${mimeType};base64,${img.base64}`;
    }
    imageUrlAttr = escapeHtml(imageUrlAttr);
    
    // Indicador de imagen offline
    const offlineBadge = img.es_offline ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; position: absolute; top: 8px; right: 8px; z-index: 10;">OFFLINE</span>' : '';
    
    // SIEMPRE renderizar el botón si currentProjectGalleryCanManage es true
    // El botón se mostrará/ocultará según los permisos
    const removeButton = currentProjectGalleryCanManage
      ? `<button class="btn-remove-item" data-imagen-id="${img.id}" data-image-name="${encodedName}" title="Eliminar imagen" style="display: block;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
         </button>`
      : '';

    const imageDescriptionAttr = escapeHtml(img.descripcion || '');
    const imageAltAttr = escapeHtml(img.nombre || img.archivo_nombre || 'Imagen');
    
    const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%231d2531'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23b8c5d1' font-family='Arial' font-size='16'>Sin imagen</text></svg>";

    return `
      <div class="gallery-item" data-image-url="${imageUrlAttr}" data-image-description="${imageDescriptionAttr}" style="position: relative;">
        ${offlineBadge}
        ${removeButton}
        <img src="${imageUrlAttr}" alt="${imageAltAttr}" data-image-url="${imageUrlAttr}" data-image-description="${imageDescriptionAttr}" loading="lazy" onerror="this.onerror=null; this.src='${placeholderSvg}'">
        ${descriptionHtml}
      </div>
    `;
  }).join('');

  const navHtml = totalPages > 1
    ? `<div class="project-gallery-nav">
        <button class="project-gallery-nav-btn" data-gallery-direction="prev" ${currentProjectGalleryPage === 0 ? 'disabled' : ''} aria-label="Ver imágenes anteriores">▲</button>
        <button class="project-gallery-nav-btn" data-gallery-direction="next" ${currentProjectGalleryPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Ver imágenes siguientes">▼</button>
      </div>`
    : '';

  // Insertar el HTML primero
  detailGallery.innerHTML = `
    <div class="project-gallery-wrapper">
      <div class="gallery-items-wrapper">
        ${itemsHtml}
      </div>
      ${navHtml}
    </div>
  `;

  // Agregar event listeners DESPUÉS de insertar el HTML
  // IMPORTANTE: Usar delegación de eventos directamente sin clonar el wrapper
  const galleryWrapper = detailGallery.querySelector('.gallery-items-wrapper');
  
  if (galleryWrapper) {
    // Limpiar listeners anteriores si existen
    if (galleryWrapper._imageDeleteHandler) {
      galleryWrapper.removeEventListener('click', galleryWrapper._imageDeleteHandler, true);
    }
    if (galleryWrapper._imageModalHandler) {
      galleryWrapper.removeEventListener('click', galleryWrapper._imageModalHandler, false);
    }
    
    // Unico handler delegado para la galeria: evita el problema de capture phase
    // que bloqueaba los clics normales y causaba que el hover/click se sintiera "trabado".
    if (galleryWrapper._galleryUnifiedHandler) {
      galleryWrapper.removeEventListener('click', galleryWrapper._galleryUnifiedHandler);
      galleryWrapper._galleryUnifiedHandler = null;
    }

    galleryWrapper._galleryUnifiedHandler = function (e) {
      const removeBtn = e.target.closest('.btn-remove-item');
      if (removeBtn && currentProjectGalleryCanManage) {
        e.preventDefault();
        e.stopPropagation();
        const imagenId = removeBtn.getAttribute('data-imagen-id');
        const imageName = removeBtn.hasAttribute('data-image-name')
          ? decodeURIComponent(removeBtn.getAttribute('data-image-name'))
          : '';
        if (imagenId) {
          confirmarEliminacionImagenGaleria(imagenId, imageName);
        }
        return;
      }

      const galleryItem = e.target.closest('.gallery-item');
      if (!galleryItem) return;

      const imageUrl = galleryItem.dataset.imageUrl ||
                       galleryItem.querySelector('img')?.dataset.imageUrl ||
                       galleryItem.querySelector('img')?.getAttribute('src');
      const imageDescription = galleryItem.dataset.imageDescription ||
                              galleryItem.querySelector('img')?.dataset.imageDescription || '';
      if (imageUrl) {
        showImageViewModal(imageUrl, imageDescription);
      }
    };

    galleryWrapper.addEventListener('click', galleryWrapper._galleryUnifiedHandler);
  }
}

function confirmarEliminacionImagenGaleria(imagenId, imageName = '') {

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }

  const trimmedName = (imageName || '').trim();
  const message = trimmedName
    ? `¿Estás seguro de que deseas eliminar la imagen "${trimmedName}" de la galería?`
    : '¿Estás seguro de que deseas eliminar esta imagen de la galería?';

  // Usar showConfirmModal en lugar de showConfirmDeleteModal para consistencia
  showConfirmModal(message, async () => {
    await eliminarImagenGaleria(imagenId);
  });
}

function openGalleryFullModal() {
  const modal = document.getElementById('galleryFullModal');
  const masonry = document.getElementById('galleryFullMasonry');
  if (!modal || !masonry) return;

  masonry.innerHTML = '';

  if (!Array.isArray(currentProjectGalleryImages) || currentProjectGalleryImages.length === 0) {
    masonry.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 40px;">No hay imágenes disponibles.</p>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    return;
  }

  const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%231d2531'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23b8c5d1' font-family='Arial' font-size='16'>Sin imagen</text></svg>";

  currentProjectGalleryImages.forEach((img, index) => {
    const imageUrl = img.url || (img.base64 ? `data:${img.tipo || 'image/jpeg'};base64,${img.base64}` : '');
    const description = escapeHtml(img.descripcion || '');

    const item = document.createElement('div');
    item.className = 'gallery-masonry-item';
    item.dataset.index = index;
    item.innerHTML = `
      <img src="${imageUrl}" alt="${escapeHtml(img.nombre || img.archivo_nombre || 'Imagen')}" loading="lazy" onerror="this.onerror=null; this.src='${placeholderSvg}'">
      ${description ? `<div class="gallery-masonry-description">${description}</div>` : ''}
    `;
    item.addEventListener('click', () => {
      openGalleryLightbox(index);
    });
    masonry.appendChild(item);
  });

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeGalleryFullModal() {
  const modal = document.getElementById('galleryFullModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openEditImageDescriptionModal(imageId) {
  if (!imageId || !tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }
  const img = currentProjectGalleryImages.find(i => String(i.id) === String(imageId));
  if (!img) return;

  const modal = document.getElementById('editImageDescriptionModal');
  const textarea = document.getElementById('editImageDescriptionText');
  const confirmBtn = document.getElementById('confirmEditImageDescriptionBtn');
  if (!modal || !textarea || !confirmBtn) return;

  textarea.value = img.descripcion || '';
  confirmBtn.dataset.imageId = imageId;
  showModal('editImageDescriptionModal');
}

async function saveImageDescription() {
  const confirmBtn = document.getElementById('confirmEditImageDescriptionBtn');
  const imageId = confirmBtn ? confirmBtn.dataset.imageId : null;
  if (!imageId) return;

  const textarea = document.getElementById('editImageDescriptionText');
  const descripcion = textarea ? textarea.value.trim() : '';

  const currentProject = getCurrentProject();
  if (!currentProject || !currentProject.id) {
    showErrorMessage('No se pudo obtener la información del proyecto');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('descripcion', descripcion);
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

    const response = await fetch(`/api/evento/${currentProject.id}/galeria/${imageId}/descripcion/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCookie('csrftoken') },
      body: formData
    });

    const result = await response.json();
    if (result.success) {
      // Actualizar localmente
      const img = currentProjectGalleryImages.find(i => String(i.id) === String(imageId));
      if (img) {
        img.descripcion = descripcion;
      }
      // Actualizar descripcion en el lightbox si esta abierto
      if (imageViewCurrentIndex !== -1 && imageViewSourceImages[imageViewCurrentIndex]) {
        const currentImg = imageViewSourceImages[imageViewCurrentIndex];
        if (String(currentImg.id) === String(imageId)) {
          currentImg.descripcion = descripcion;
          document.getElementById('imageViewDescription').textContent = descripcion;
        }
      }
      // Re-renderizar galeria
      renderProjectGalleryPage();
      hideModal('editImageDescriptionModal');
      showSuccessMessage('Descripción actualizada exitosamente');
    } else {
      showErrorMessage(result.error || 'Error al actualizar la descripción');
    }
  } catch (error) {
    showErrorMessage('Error al actualizar la descripción. Intenta de nuevo.');
  }
}

function setGalleryImageAsCover(imageId) {
  if (!imageId || !tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }
  const currentProject = getCurrentProject();
  if (!currentProject || !currentProject.id) return;

  const img = currentProjectGalleryImages.find(i => String(i.id) === String(imageId));
  if (!img) return;

  const hasExistingCover = !!(currentProject.portada && currentProject.portada.url);
  const action = async () => {
    try {
      const formData = new FormData();
      formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

      const response = await fetch(`/api/evento/${currentProject.id}/galeria/${imageId}/portada/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        currentProject.portada = result.portada;
        // Actualizar imagen principal si estamos en detalle
        const detailMainImage = document.getElementById('detailMainImage');
        if (detailMainImage && result.portada && result.portada.url) {
          detailMainImage.src = result.portada.url;
        }
        showSuccessMessage('Portada actualizada exitosamente');
      } else {
        showErrorMessage(result.error || 'Error al establecer la portada');
      }
    } catch (error) {
      showErrorMessage('Error al establecer la portada. Intenta de nuevo.');
    }
  };

  if (hasExistingCover) {
    showConfirmModal(
      'Ya existe una portada para este proyecto. ¿Deseas cambiarla por esta imagen?',
      action,
      () => {},
      'Cambiar portada',
      'btn-warning'
    );
  } else {
    action();
  }
}

document.addEventListener('click', (event) => {
  const navBtn = event.target.closest('.project-gallery-nav-btn');
  if (!navBtn) {
    return;
  }

  if (!currentProjectGalleryImages.length) {
    return;
  }

  event.preventDefault();

  const direction = navBtn.getAttribute('data-gallery-direction');
  const totalPages = Math.ceil(currentProjectGalleryImages.length / PROJECT_GALLERY_PAGE_SIZE);

  if (direction === 'prev' && currentProjectGalleryPage > 0) {
    currentProjectGalleryPage -= 1;
    renderProjectGalleryPage();
  } else if (direction === 'next' && currentProjectGalleryPage < totalPages - 1) {
    currentProjectGalleryPage += 1;
    renderProjectGalleryPage();
  }
});

// Función para manejar selección de imagen

function handleImageSelect(event) {
  const input = event.target;
  const files = Array.from(input.files || []);

  if (!files.length) {
    return;
  }

  let invalidFiles = 0;
  let addedFiles = 0;
  const canUseObjectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

  files.forEach((file) => {
    if (file && file.type && file.type.startsWith('image/')) {
      if (canUseObjectUrl) {
        try {
          const objectUrl = URL.createObjectURL(file);
          pendingProjectGalleryImages.push({
            file,
            previewUrl: objectUrl,
            objectUrl,
            description: '',
          });
          addedFiles += 1;
        } catch (error) {
          const reader = new FileReader();
          reader.onload = (e) => {
            pendingProjectGalleryImages.push({
              file,
              previewUrl: e.target && e.target.result ? e.target.result : '',
              description: '',
            });
            renderPendingProjectImages();
          };
          reader.onerror = (readError) => {
            showErrorMessage('No se pudo previsualizar una de las imágenes seleccionadas.');
          };
          reader.readAsDataURL(file);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          pendingProjectGalleryImages.push({
            file,
            previewUrl: e.target && e.target.result ? e.target.result : '',
            description: '',
          });
          renderPendingProjectImages();
        };
        reader.onerror = (readError) => {
          showErrorMessage('No se pudo previsualizar una de las imágenes seleccionadas.');
        };
        reader.readAsDataURL(file);
      }
    } else {
      invalidFiles += 1;
    }
  });

  if (addedFiles > 0) {
    renderPendingProjectImages();
  }

  if (invalidFiles > 0) {
    showErrorMessage('Algunos archivos fueron descartados porque no son imágenes válidas.');
  }

  input.value = '';
}

// Función para agregar imagen al proyecto

// Flag para prevenir ejecuciones múltiples simultáneas
let isUploadingImage = false;
let isUploadingChange = false;
let isUploadingFile = false;

async function addImageToProject() {
  
  // Prevenir ejecuciones múltiples
  if (isUploadingImage) {
    return;
  }

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();

    return;

  }

  if (!pendingProjectGalleryImages.length) {
    showErrorMessage('Selecciona al menos una imagen antes de continuar.');

    return;

  }

  // Marcar como en proceso
  isUploadingImage = true;

  // Obtener el proyecto actual

  let currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    const detailTitle = document.getElementById('detailTitle');

    if (detailTitle && detailTitle.dataset.projectId) {

      const projectId = detailTitle.dataset.projectId;

      try {

        const response = await fetch(`/api/proyecto/${projectId}/`);

        const data = await response.json();

        if (data.success) {

          currentProject = data.proyecto;

          currentProjectData = currentProject;

          currentProjectId = currentProject.id;

        }

      } catch (error) {

      }

    }

    if (!currentProject || !currentProject.id) {

      showErrorMessage('Error: No se pudo obtener la información del evento. Por favor, recarga la página.');

      return;

    }

  }

  const confirmButton = document.getElementById('confirmImageBtn');
  const originalLabel = confirmButton ? confirmButton.textContent : null;

  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Guardando...';
  }

  const imagesToUpload = [...pendingProjectGalleryImages];
  const isOffline = !navigator.onLine;
  const db = getOfflineDB();

  // Modo offline: guardar imágenes en IndexedDB
  if (isOffline && db) {
    try {
      if (!currentProject.evidencias) {
        currentProject.evidencias = [];
      }

      // Convertir imágenes a base64 y agregarlas al proyecto
      for (let i = 0; i < imagesToUpload.length; i++) {
        const item = imagesToUpload[i];
        const file = item.file;
        const description = (item.description || '').trim();

        try {
          const base64 = await fileToBase64(file);
          const extension = file.name.split('.').pop()?.toLowerCase() || '';
          const mimeType = file.type || `image/${extension}`;

          const nuevaEvidencia = {
            id: `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            nombre: file.name,
            archivo_nombre: file.name,
            descripcion: description,
            tamanio: file.size,
            tipo: mimeType,
            archivo_tipo: mimeType,
            extension: extension,
            base64: base64,
            url: `data:${mimeType};base64,${base64}`, // URL para mostrar inmediatamente
            es_imagen: true,
            es_galeria: true,
            es_offline: true,
            creado_en: new Date().toISOString(),
            modificado_offline: true
          };

          currentProject.evidencias.push(nuevaEvidencia);
        } catch (error) {
          console.warn(`Error al convertir imagen ${file.name} a base64:`, error);
          showErrorMessage(`Error al procesar la imagen ${file.name}. Por favor, intenta con otra imagen.`);
        }
      }

      currentProject.modificado_offline = true;
      currentProject.ultimo_sync = new Date().toISOString();

      await db.saveProyecto(currentProject);

      // Actualizar vista inmediatamente
      currentProjectData = currentProject;
      await mostrarDetalleProyecto(currentProject);

      // Limpiar formulario
      clearImageForm();
      hideModal('addImageModal');

      // Liberar previews
      imagesToUpload.forEach(revokePendingImagePreview);

      showSuccessMessage(`${imagesToUpload.length} imagen(es) guardada(s) sin conexión. Se enviarán automáticamente cuando vuelva el internet.`);

      // Intentar agregar a la cola de sincronización
      // Guardar archivos como base64 para poder serializarlos
      const csrfToken = getCookie('csrftoken');
      if (window.OfflineSync && window.OfflineSync.enqueueManual && csrfToken) {
        for (let i = 0; i < imagesToUpload.length; i++) {
          const item = imagesToUpload[i];
          const file = item.file;
          const description = (item.description || '').trim();

          try {
            // Convertir archivo a base64 para poder serializarlo
            const base64 = await fileToBase64(file);
            
            // Guardar en la cola usando enqueueManual que procesa el body correctamente
            window.OfflineSync.enqueueManual(`/api/evento/${currentProject.id}/galeria/agregar/`, {
              method: 'POST',
              headers: {
                'X-CSRFToken': csrfToken
              },
              body: {
                type: 'formdata',
                files: [{
                  key: 'imagen',
                  fileName: file.name,
                  fileType: file.type,
                  base64: base64
                }],
                fields: description ? [{ key: 'descripcion', value: description }] : []
              }
            });
            console.log(`✅ Imagen ${file.name} agregada a la cola de sincronización`);
          } catch (error) {
            console.error(`❌ Error al agregar imagen ${file.name} a la cola:`, error);
          }
        }
        // Actualizar el estado de sincronización
        if (window.OfflineSync.updateSyncStatus) {
          window.OfflineSync.updateSyncStatus();
        }
      } else {
        console.warn('⚠️ OfflineSync no está disponible o no hay CSRF token');
      }

      isUploadingImage = false;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalLabel || 'Agregar';
      }

      return;
    } catch (error) {
      console.error('Error al guardar imágenes offline:', error);
      showErrorMessage('Error al guardar las imágenes offline. Por favor, intenta de nuevo.');
      isUploadingImage = false;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalLabel || 'Agregar';
      }
      return;
    }
  }

  // Modo online: enviar al servidor normalmente
  const csrfToken = getCookie('csrftoken');

  if (!csrfToken) {
    showErrorMessage('Error de autenticación. Por favor, recarga la página.');
    isUploadingImage = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    return;
  }

  let uploadedCount = 0;

  try {
    for (const item of imagesToUpload) {
      const formData = new FormData();
      formData.append('imagen', item.file);
      formData.append('descripcion', (item.description || '').trim());

      const response = await fetch(`/api/evento/${currentProject.id}/galeria/agregar/`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo agregar la imagen');
      }

      uploadedCount += 1;
    }

    clearImageForm();
    hideModal('addImageModal');

    // Actualizar la vista en tiempo real
    await refreshCurrentProject(uploadedCount === 1 ? 'Imagen agregada exitosamente' : 'Imágenes agregadas exitosamente');

  } catch (error) {
    if (uploadedCount > 0) {
      const uploadedItems = imagesToUpload.slice(0, uploadedCount);
      uploadedItems.forEach(revokePendingImagePreview);
    }

    pendingProjectGalleryImages = imagesToUpload.slice(uploadedCount);
    renderPendingProjectImages();

    if (uploadedCount > 0) {
      showErrorMessage((error.message || 'Ocurrió un problema al agregar las imágenes.') + ' Se subieron ' + uploadedCount + ' imagen(es) antes del error.');
    } else {
      showErrorMessage(error.message || 'No se pudieron agregar las imágenes.');
    }

  } finally {
    // Liberar el flag
    isUploadingImage = false;

    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
  }

}

// Función para eliminar imagen de la galería

async function eliminarImagenGaleria(imagenId) {
  
  let currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {
    const detailTitle = document.getElementById('detailTitle');

    if (detailTitle && detailTitle.dataset.projectId) {
      const projectId = detailTitle.dataset.projectId;

      try {
        const response = await fetch(`/api/proyecto/${projectId}/`);
        const data = await response.json();

        if (data.success) {
          currentProject = data.proyecto;
          currentProjectData = currentProject;
          currentProjectId = currentProject.id;
        }
      } catch (error) {
      }
    }

    if (!currentProject || !currentProject.id) {
      showErrorMessage('No se pudo obtener la información del evento. Por favor, recarga la página.');
      return;
    }
  }

  try {
    console.log('Eliminando imagen:', imagenId, 'del proyecto:', currentProject.id); // Debug
    const response = await fetch(`/api/evento/${currentProject.id}/galeria/${imagenId}/eliminar/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': getCookie('csrftoken')
      }
    });

    if (!response.ok) {
      console.error('Error en la respuesta HTTP:', response.status, response.statusText); // Debug
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Respuesta de la API:', result); // Debug

    if (result.success) {
      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Imagen eliminada exitosamente de la galería.');
    } else {
      throw new Error(result.error || 'Error al eliminar la imagen de la galería.');
    }
  } catch (error) {
    console.error('Error al eliminar imagen:', error); // Debug
    showErrorMessage(error.message || 'Error al eliminar la imagen. Por favor, intenta de nuevo.');
  }
}
// Función para mostrar modal de editar descripción

function showEditDescriptionModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  // Cargar la descripción actual del proyecto
  const descripcionActual = currentProject.descripcion || '';

  const descripcionTexto = descripcionActual
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();

  const editDescriptionText = document.getElementById('editDescriptionText');

  if (editDescriptionText) {

    editDescriptionText.value = descripcionTexto;

  }

  showModal('editDescriptionModal');

}

// Función para actualizar descripción del proyecto

async function updateProjectDescription() {

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();

    return;

  }

  const newDescription = document.getElementById('editDescriptionText').value.trim();

  if (!newDescription) {

    showErrorMessage('Por favor ingresa una descripción');

    return;

  }

  // Normalizar saltos de línea a <br> para almacenarlos
  const newDescriptionHtml = newDescription.replace(/\r?\n/g, '<br>');

  // Obtener el proyecto actual

  let proyecto = getCurrentProject();

  if (!proyecto || !proyecto.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  const isOffline = !navigator.onLine;
  const db = getOfflineDB();

  try {

    // Preparar datos para enviar a la API

    const formData = new FormData();

    formData.append('descripcion', newDescriptionHtml);

    if (isOffline && db) {
      // Modo offline: guardar en IndexedDB y cola de sincronización
      proyecto.descripcion = newDescriptionHtml;
      proyecto.modificado_offline = true;
      proyecto.ultimo_sync = new Date().toISOString();
      
      await db.saveProyecto(proyecto);
      
      // Actualizar la vista inmediatamente
      currentProjectData = proyecto;
      const detailDescription = document.getElementById('detailDescription');
      if (detailDescription) {
        detailDescription.innerHTML = newDescriptionHtml || '<p style="color: #6c757d;">No hay descripción disponible</p>';
      }
      
      // Cerrar modal
      hideModal('editDescriptionModal'); // Corregido: closeModal no existe, se usa hideModal
      
      showSuccessMessage('Descripción guardada sin conexión. Se enviará automáticamente cuando vuelva el internet.');
      
      // Intentar enviar a la cola de sincronización (si está disponible)
      const csrfToken = getCookie('csrftoken');
      if (window.OfflineSync && window.OfflineSync.enqueueManual && csrfToken) {
        try {
          window.OfflineSync.enqueueManual(`/api/evento/${proyecto.id}/actualizar/`, {
            method: 'POST',
            headers: {
              'X-CSRFToken': csrfToken
            },
            body: formData
          });
          console.log('✅ Descripción agregada a la cola de sincronización');
        } catch (error) {
          console.error('❌ Error al agregar descripción a la cola:', error);
        }
        if (window.OfflineSync.updateSyncStatus) {
          window.OfflineSync.updateSyncStatus();
        }
      }
      
      return;
    }

    // Modo online: enviar a la API

    const response = await fetch(`/api/evento/${proyecto.id}/actualizar/`, {
      credentials: 'include',

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    const result = await response.json();

    if (result.success) {

      // Recargar los detalles del proyecto para mostrar la descripción actualizada

      shouldRefreshLatestProjects = true;
      await loadProjectDetails(proyecto.id);

      hideModal('editDescriptionModal');

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Descripción actualizada exitosamente.');

    } else {

      showErrorMessage(result.error || 'Error al actualizar la descripción.');

    }

  } catch (error) {

    showErrorMessage('Error al guardar la descripción. Por favor, intenta de nuevo.');

  }

}

// Variables globales para el modal de edición de datos

let selectedCards = [];

let currentEditProject = null;

// Función para mostrar modal de editar datos

function showEditDataModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  currentEditProject = getCurrentProject();

  // Obtener el proyecto actual con fallback

  let proyecto = getCurrentProject();

  if (!proyecto || !proyecto.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  // Cargar datos actuales de las tarjetas desde tarjetas_datos (viene de la API)

  const tarjetasDatos = proyecto.tarjetas_datos || [];
  
  // DEBUG: Mostrar tarjetas originales cargadas desde la BD
  console.log('📂 CARGANDO MODAL DE EDICIÓN:');
  console.log('📊 Tarjetas originales desde BD:', tarjetasDatos);
  console.log('🔢 Total de tarjetas:', tarjetasDatos.length);

  // Convertir las tarjetas existentes al formato de tarjetas seleccionadas

  selectedCards = tarjetasDatos.map(tarjeta => {

    const tituloNormalizado = (tarjeta.titulo || '').toLowerCase().trim();

    const isLocked = tituloNormalizado === 'beneficiarios';

    return {

      id: tarjeta.id,

      icon: tarjeta.icono || '📊',

      label: tarjeta.titulo,

      value: tarjeta.valor || '',

      isCustom: true, // Las tarjetas de la BD se consideran personalizadas

      isLocked

    };

  });

  // Cargar la interfaz del modal

  loadEditDataModal();

  showModal('editDataModal');

}
// Función para cargar la interfaz del modal de edición

function loadEditDataModal() {

  // Cargar tarjetas predefinidas

  loadPredefinedCards();

  // Cargar tarjetas seleccionadas

  loadSelectedCards();

  // Configurar event listeners

  setupEditDataEventListeners();

  // Inicializar selector de emojis (solo una vez)

  const emojiBtn = document.getElementById('emojiPickerBtn');

  if (emojiBtn && !emojiBtn._emojiPickerInit) {

    initEmojiPicker();

    emojiBtn._emojiPickerInit = true;

  }

}

// Función para cargar tarjetas predefinidas

function loadPredefinedCards() {

  const grid = document.getElementById('predefinedCardsGrid');

  if (!grid) return;

  grid.innerHTML = '';

  predefinedCards.forEach(card => {

    const cardElement = document.createElement('div');

    cardElement.className = 'predefined-card';

    cardElement.dataset.cardId = card.id;

    // Verificar si ya está seleccionada usando el ID de la tarjeta predefinida

    const isSelected = selectedCards.some(selected => 

      selected.predefinedCardId === card.id || 

      (selected.label === card.label && !selected.isCustom && (!selected.id || selected.id?.startsWith('card_')))

    );

    if (isSelected) {

      cardElement.classList.add('selected');

    }

    cardElement.innerHTML = `

      <div class="predefined-card-icon">${card.icon}</div>

      <div class="predefined-card-info">

        <div class="predefined-card-label">${card.label}</div>

        <div class="predefined-card-category">${card.category}</div>

      </div>

    `;

    cardElement.addEventListener('click', () => togglePredefinedCard(card));

    grid.appendChild(cardElement);

  });

}

// Función para cargar tarjetas seleccionadas
function loadSelectedCards() {
  const container = document.getElementById('selectedCardsContainer');
  const countBadge = document.getElementById('selectedCardsCount');

  if (!container) return;

  container.innerHTML = '';
  if (countBadge) countBadge.textContent = selectedCards.length;

  if (selectedCards.length === 0) {
    container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">No hay tarjetas seleccionadas. Selecciona tarjetas predefinidas o crea una personalizada.</p>';
    return;
  }

  const puedeEditarTarjetas = !!puedeGestionarProyectoActual;

  selectedCards.forEach((card, index) => {
    const cardElement = document.createElement('div');
    cardElement.className = 'selected-card';
    cardElement.dataset.index = index;

    const icon = escapeHtml(card.icon || '📊');
    const label = escapeHtml(card.label || '');
    const value = escapeHtml(card.value || '');
    const isLocked = !!card.isLocked;
    const esSoloLectura = isLocked || !puedeEditarTarjetas;

    if (esSoloLectura) {
      cardElement.classList.add('selected-card-locked');
      const indicatorLabel = isLocked ? 'Fijo' : 'Solo lectura';
      const indicatorTitle = isLocked
        ? 'Este dato no se puede editar ni eliminar'
        : 'No tienes permisos para editar este dato';

      cardElement.innerHTML = `
        <div class="selected-card-icon">
          <span class="card-icon-locked" title="${indicatorTitle}">${icon}</span>
        </div>
        <div class="selected-card-info">
          <div class="selected-card-label selected-card-label-locked">${label}</div>
          <div class="selected-card-value selected-card-value-locked">${value}</div>
        </div>
        <div class="selected-card-lock-indicator" title="${indicatorTitle}" style="color: #6c757d; font-size: 0.75rem; margin-top: 8px;">${indicatorLabel}</div>
      `;
    } else {
      cardElement.innerHTML = `
        <div class="selected-card-icon">
          <input type="text" value="${icon}" placeholder="📊" class="card-icon-input" data-index="${index}" maxlength="2">
        </div>
        <div class="selected-card-info">
          <div class="selected-card-label">
            <input type="text" value="${label}" placeholder="Título de la tarjeta..." class="card-label-input" data-index="${index}">
          </div>
          <div class="selected-card-value">
            <input type="text" value="${value}" placeholder="Ingresa el valor..." class="card-value-input" data-index="${index}">
          </div>
        </div>
        <button class="remove-card-btn" data-index="${index}" title="Eliminar tarjeta" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      // Doble clic / clic para abrir modal de edicion de valor
      cardElement.addEventListener('click', (e) => {
        // No abrir si el clic fue en un input o en el boton eliminar
        if (e.target.tagName === 'INPUT' || e.target.closest('.remove-card-btn')) {
          return;
        }
        openEditCardValueModal(index);
      });
    }

    container.appendChild(cardElement);
  });

  // Delegacion de eventos para inputs y botones de eliminar (evita re-adjuntar listeners)
  if (!container._selectedCardsDelegation) {
    container._selectedCardsDelegation = true;
    
    // Handler para inputs (icono, título, valor)
    container.addEventListener('input', (e) => {
      const input = e.target;
      const index = parseInt(input.dataset.index, 10);
      if (isNaN(index) || !selectedCards[index]) return;

      if (input.classList.contains('card-icon-input')) {
        selectedCards[index].icon = input.value || '📊';
      } else if (input.classList.contains('card-label-input')) {
        selectedCards[index].label = input.value;
      } else if (input.classList.contains('card-value-input')) {
        selectedCards[index].value = input.value;
      }
    });
    
    // Handler para botones de eliminar
    container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-card-btn');
      if (!removeBtn) return;
      
      e.stopPropagation();
      const index = parseInt(removeBtn.dataset.index, 10);
      if (isNaN(index) || !selectedCards[index]) return;
      
      removeSelectedCard(index);
    });
  }
}

let editCardValueIndex = null;

function openEditCardValueModal(index) {
  if (index === null || index === undefined || !selectedCards[index]) return;
  const card = selectedCards[index];
  editCardValueIndex = index;

  const modal = document.getElementById('editCardValueModal');
  const title = document.getElementById('editCardValueTitle');
  const input = document.getElementById('editCardValueInput');
  if (!modal || !input) return;

  if (title) title.textContent = `Editar: ${card.label || 'Tarjeta'}`;
  input.value = card.value || '';
  showModal('editCardValueModal');
  setTimeout(() => input.focus(), 100);
}

function saveEditCardValue() {
  if (editCardValueIndex === null || !selectedCards[editCardValueIndex]) return;
  const input = document.getElementById('editCardValueInput');
  const newValue = input ? input.value.trim() : '';
  selectedCards[editCardValueIndex].value = newValue;
  loadSelectedCards();
  hideModal('editCardValueModal');
  editCardValueIndex = null;
}

// Función para alternar selección de tarjeta predefinida
function togglePredefinedCard(card) {
  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }

  const cardElement = document.querySelector(`[data-card-id="${card.id}"]`);
  const existingIndex = selectedCards.findIndex(selected =>
    selected.predefinedCardId === card.id
  );

  if (existingIndex !== -1) {
    // Si ya esta seleccionada, abrir modal para editar su valor
    openEditCardValueModal(existingIndex);
    return;
  }

  // Verificar duplicados por label
  const duplicateLabel = selectedCards.some(selected => (selected.label || '').toLowerCase() === card.label.toLowerCase());
  if (duplicateLabel) {
    showErrorMessage(`Ya existe una tarjeta con el título "${card.label}"`);
    return;
  }

  // Agregar a seleccionadas y abrir modal de valor
  selectedCards.push({
    id: generateCardId(),
    predefinedCardId: card.id,
    icon: card.icon,
    label: card.label,
    value: '',
    isCustom: false
  });

  if (cardElement) cardElement.classList.add('selected');
  loadSelectedCards();
  openEditCardValueModal(selectedCards.length - 1);
}

// Función para configurar event listeners del modal

function setupEditDataEventListeners() {

  // Pestañas (solo agregar listener una vez)
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    if (!btn._tabListenerAdded) {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        switchTab(tab);
      });
      btn._tabListenerAdded = true;
    }
  });

  // Búsqueda de tarjetas (solo agregar listener una vez)
  const searchInput = document.getElementById('cardSearch');
  if (searchInput && !searchInput._searchListenerAdded) {
    searchInput.addEventListener('input', filterPredefinedCards);
    searchInput._searchListenerAdded = true;
  }

  // Filtro de categorías (solo agregar listener una vez)
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter && !categoryFilter._filterListenerAdded) {
    categoryFilter.addEventListener('change', filterPredefinedCards);
    categoryFilter._filterListenerAdded = true;
  }

  // Botón de agregar tarjeta personalizada (solo agregar listener una vez)
  const addCustomBtn = document.getElementById('addCustomCardBtn');
  if (addCustomBtn && !addCustomBtn._customListenerAdded) {
    addCustomBtn.addEventListener('click', addCustomCard);
    addCustomBtn._customListenerAdded = true;
  }

  // Los event listeners para inputs y botones de eliminar se agregan en loadSelectedCards()

}

// Función para cambiar pestañas

function switchTab(tabName) {

  // Actualizar botones de pestaña

  document.querySelectorAll('.tab-btn').forEach(btn => {

    btn.classList.remove('active');

  });

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // Actualizar contenido de pestañas

  document.querySelectorAll('.tab-content').forEach(content => {

    content.classList.remove('active');

  });

  document.getElementById(`${tabName}-tab`).classList.add('active');

}

// Función para filtrar tarjetas predefinidas

function filterPredefinedCards() {

  const searchTerm = document.getElementById('cardSearch').value.toLowerCase();

  const categoryFilter = document.getElementById('categoryFilter').value;

  const cards = document.querySelectorAll('.predefined-card');

  cards.forEach(card => {

    const label = card.querySelector('.predefined-card-label').textContent.toLowerCase();

    const category = card.querySelector('.predefined-card-category').textContent;

    const matchesSearch = label.includes(searchTerm);

    const matchesCategory = !categoryFilter || category === categoryFilter;

    if (matchesSearch && matchesCategory) {

      card.style.display = 'flex';

    } else {

      card.style.display = 'none';

    }

  });

}

// Inicializar selector de emojis para crear personalizada

function initEmojiPicker() {
  const btn = document.getElementById('emojiPickerBtn');
  const dropdown = document.getElementById('emojiPickerDropdown');
  const input = document.getElementById('customIcon');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  });

  dropdown.querySelectorAll('.emoji-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (input) {
        input.value = opt.textContent;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      dropdown.style.display = 'none';
    });
  });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  }, false);
}

// Función para agregar tarjeta personalizada

function addCustomCard() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  let icon = document.getElementById('customIcon').value.trim();

  const label = document.getElementById('customLabel').value.trim();

  const value = document.getElementById('customValue').value.trim();

  if (!icon) icon = '📊';

  if (!label || !value) {

    showErrorMessage('Por favor completa el título y el valor');

    return;

  }

  // Verificar si ya existe una tarjeta con el mismo título

  const normalizedLabel = label.toLowerCase();

  if (selectedCards.some(card => (card.label || '').toLowerCase() === normalizedLabel)) {

    showErrorMessage('Ya existe una tarjeta con este título');

    return;

  }

  // Agregar tarjeta personalizada

  selectedCards.push({

    id: generateCardId(),

    icon: icon,

    label: label,

    value: value,

    isCustom: true

  });

  // Limpiar formulario

  document.getElementById('customIcon').value = '';

  document.getElementById('customLabel').value = '';

  document.getElementById('customValue').value = '';

  // Recargar tarjetas seleccionadas

  loadSelectedCards();

  showSuccessMessage('Tarjeta personalizada agregada');

}

// Función para remover tarjeta seleccionada

function removeSelectedCard(index) {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  if (selectedCards[index] && selectedCards[index].isLocked) {

    showErrorMessage('Este dato es fijo y no se puede eliminar.');

    return;

  }

  showConfirmModal(

    '¿Estás seguro de que deseas eliminar este dato del proyecto?',

    () => {

      selectedCards.splice(index, 1);

      loadSelectedCards();

      // Actualizar estado de tarjetas predefinidas

      loadPredefinedCards();

    }

  );

}

// Función para actualizar valor de tarjeta seleccionada (ya no se usa, se maneja con event listeners)

function updateSelectedCardValue(index, value) {

  if (selectedCards[index]) {

    selectedCards[index].value = value;

  }

}
// Función para generar ID único para tarjetas

function generateCardId() {

  return 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

}
// Función para limpiar formulario de datos

function clearDataForm() {

  document.getElementById('editProjectTitle').value = '';

  document.getElementById('editProjectLocation').value = '';

  document.getElementById('editProjectDate').value = '';

  document.getElementById('editProjectStatus').value = '';

}

// Función para actualizar datos del proyecto

async function updateProjectData() {

  const participants = document.getElementById('editParticipants').value;

  const duration = document.getElementById('editDuration').value;

  const objective = document.getElementById('editObjective').value;

  const evaluation = document.getElementById('editEvaluation').value;

  if (!participants.trim() || !duration.trim() || !objective.trim() || !evaluation.trim()) {

    showErrorMessage('Por favor completa todos los campos');

    return;

  }

  const currentProject = getCurrentProject();

  if (currentProject) {

    // Actualizar los datos de las tarjetas

    currentProject.data = [

      { icon: '👥', label: 'Participantes', value: participants },

      { icon: '⏱️', label: 'Duración', value: duration },

      { icon: '🎯', label: 'Objetivo', value: objective },

      { icon: '📊', label: 'Evaluación', value: evaluation }

    ];

    // Recargar la vista del proyecto

    await loadProjectDetail(currentProject);

    showSuccessMessage('Datos actualizados exitosamente');

    hideModal('editDataModal');

  }

}

// Función para mostrar modal de agregar comunidad

function showAddCommunityModal() {

  showModal('addCommunityModal');

  loadCommunitiesList();

}

// Función para limpiar formulario de comunidad

function clearCommunityForm() {

  document.getElementById('communityName').value = '';

  document.getElementById('communityRegion').value = '';

}

// Función para agregar comunidad al proyecto

async function addCommunityToProject() {

  const selectedCommunities = getSelectedCommunities();

  if (selectedCommunities.length === 0) {

    showErrorMessage('Por favor selecciona al menos una comunidad');

    return;

  }

  const currentProject = getCurrentProject();

  if (currentProject) {

    if (!currentProject.communities) {

      currentProject.communities = [];

    }

    selectedCommunities.forEach(community => {

      const communityData = {

        name: community.name,

        region: community.region

      };

      currentProject.communities.push(communityData);

    });

    // Recargar la vista del proyecto

    await loadProjectDetail(currentProject);

    showSuccessMessage(`${selectedCommunities.length} comunidad(es) agregada(s) exitosamente`);

    hideModal('addCommunityModal');

  }

}

// Función para mostrar modal de agregar personal

async function showAddPersonnelModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  showModal('addPersonnelModal');

  await loadPersonnelListFromAPI();

  // Configurar búsqueda de personal

  const searchInput = document.getElementById('personnelSearch');

  if (searchInput) {

    searchInput.value = '';

    // Remover listeners anteriores para evitar duplicados

    const newSearchInput = searchInput.cloneNode(true);

    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', filterPersonnelList);

  }

}
// Función para cargar colaboradores desde la API

async function loadPersonnelListFromAPI() {

  const personnelList = document.getElementById('personnelList');

  if (!personnelList) return;

  personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #6c757d;">Cargando colaboradores...</div>';

  try {

    const response = await fetch('/api/personal/');

    if (!response.ok) {

      throw new Error('Error al cargar colaboradores');

    }

    const colaboradores = await response.json();

    if (colaboradores.length === 0) {

      personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #6c757d;">No hay colaboradores disponibles.</div>';

      return;

    }

    // Obtener el proyecto actual para ver qué personal ya está asignado

    const currentProject = getCurrentProject();

    const personalAsignadoIds = currentProject && currentProject.personal 

      ? currentProject.personal.map(p => p.id || p.colaborador_id || p.usuario_id).filter(Boolean)

      : [];

    personnelList.innerHTML = colaboradores.map(colaborador => {

      const isSelected = personalAsignadoIds.includes(colaborador.id);

      return `

        <div class="personnel-item" data-personnel-id="${colaborador.id}" data-personnel-type="${colaborador.tipo || 'colaborador'}" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: pointer; border: 2px solid ${isSelected ? '#007bff' : 'transparent'}; ${isSelected ? 'background: rgba(0, 123, 255, 0.1);' : ''}">

          <input type="checkbox" class="personnel-checkbox" data-personnel-id="${colaborador.id}" ${isSelected ? 'checked disabled' : ''} style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">

          <div style="flex: 1;">

            <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1rem;">${colaborador.nombre || 'Sin nombre'}</h4>

            <p style="margin: 2px 0; color: #007bff; font-size: 0.9rem;">${colaborador.puesto || 'Sin puesto'}</p>

            <p style="margin: 2px 0; color: #b8c5d1; font-size: 0.85rem;">${colaborador.rol_display || 'Colaborador'}</p>

            ${isSelected ? '<p style="margin: 4px 0 0 0; color: #ffc107; font-size: 0.8rem;">✓ Ya asignado</p>' : ''}

          </div>

        </div>

      `;

    }).join('');

    // Agregar event listeners a los checkboxes

    personnelList.querySelectorAll('.personnel-checkbox').forEach(checkbox => {

      checkbox.addEventListener('change', function() {

        const item = this.closest('.personnel-item');

        if (this.checked) {

          item.style.borderColor = '#007bff';

          item.style.background = 'rgba(0, 123, 255, 0.1)';

        } else {

          item.style.borderColor = 'transparent';

          item.style.background = 'rgba(255, 255, 255, 0.05)';

        }

      });

    });

  } catch (error) {

    personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error al cargar colaboradores. Por favor, intenta de nuevo.</div>';

  }

}

// Función para limpiar formulario de personal

function clearPersonnelForm() {

  document.getElementById('personnelName').value = '';

  document.getElementById('personnelRole').value = '';

}

// Función para agregar personal al proyecto

async function addPersonnelToProject() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  const selectedPersonnel = getSelectedPersonnel();

  if (selectedPersonnel.length === 0) {

    showErrorMessage('Por favor selecciona al menos un colaborador');

    return;

  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  try {

    // Obtener el personal actual del evento

    const currentPersonnel = currentProject.personal || [];

    const currentPersonnelIds = currentPersonnel.map(p => p.id || p.colaborador_id || p.usuario_id).filter(Boolean);

    // Preparar el nuevo personal a agregar (solo los que no están ya asignados)

    const newPersonnel = selectedPersonnel.filter(p => !currentPersonnelIds.includes(p.id));

    if (newPersonnel.length === 0) {

      showErrorMessage('Los colaboradores seleccionados ya están asignados al evento.');

      return;

    }

    // Preparar el formato para la API

    const personalIds = [

      ...currentPersonnel.map(p => ({

        id: p.id || p.colaborador_id || p.usuario_id,

        tipo: p.tipo || 'colaborador',

        rol: p.rol || 'Colaborador'

      })),

      ...newPersonnel.map(p => ({

        id: p.id,

        tipo: p.tipo,

        rol: 'Colaborador'

      }))

    ];

    // Crear FormData para enviar a la API

    const formData = new FormData();

    formData.append('personal_ids', JSON.stringify(personalIds));

    // Llamar a la API de actualizar evento

    const response = await fetch(`/api/evento/${currentProject.id}/actualizar/`, {

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    const result = await response.json();

    if (result.success) {

      // Recargar los detalles del evento

      shouldRefreshLatestProjects = true;
      hideModal('addPersonnelModal');

      // Actualizar la vista en tiempo real
      await refreshCurrentProject(`${newPersonnel.length} colaborador(es) agregado(s) exitosamente`);

    } else {

      showErrorMessage(result.error || 'Error al agregar personal al evento.');

    }

  } catch (error) {

    showErrorMessage('Error al agregar personal. Por favor, intenta de nuevo.');

  }

}

// Función para obtener el token CSRF

function getCookie(name) {

  let cookieValue = null;

  if (document.cookie && document.cookie !== '') {

    const cookies = document.cookie.split(';');

    for (let i = 0; i < cookies.length; i++) {

      const cookie = cookies[i].trim();

      if (cookie.substring(0, name.length + 1) === (name + '=')) {

        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));

        break;

      }

    }

  }

  return cookieValue;

}

// Función para mostrar modal de agregar cambio

function showAddChangeModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  editingCambioId = null;
  editingCambioGroupId = null;
  editingCambioIds = [];

  document.getElementById('changeModalTitle').textContent = 'Agregar Cambio';

  document.getElementById('confirmChangeBtn').textContent = 'Agregar';

  showModal('addChangeModal');

  clearChangeForm();

  // Esperar un momento para que el modal esté completamente visible antes de cargar la lista
  setTimeout(() => {
    loadChangePersonnelList();
    loadChangeCommunitiesList();
  }, 100);

}

// Variable para almacenar el ID del cambio que se está editando

let editingCambioId = null;
let editingCambioGroupId = null;
let editingCambioIds = [];

function resetChangeCurrentTimeControls() {
  const checkbox = document.getElementById('changeUseCurrentTime');
  const dateInput = document.getElementById('changeDate');
  const timeInput = document.getElementById('changeTime');
  const helper = document.getElementById('changeUseCurrentTimeHelper');

  if (checkbox) {
    checkbox.checked = false;
  }

  if (dateInput) {
    dateInput.disabled = false;
    delete dateInput.dataset.prevValue;
  }

  if (timeInput) {
    timeInput.disabled = false;
    delete timeInput.dataset.prevValue;
  }

  if (helper) {
    helper.style.display = 'none';
  }
}

function toggleChangeUseCurrentTime(isChecked) {
  const dateInput = document.getElementById('changeDate');
  const timeInput = document.getElementById('changeTime');
  const helper = document.getElementById('changeUseCurrentTimeHelper');

  if (!dateInput || !timeInput) {
    return;
  }

  if (isChecked) {
    dateInput.dataset.prevValue = dateInput.value || '';
    timeInput.dataset.prevValue = timeInput.value || '';

    const guatemalaNow = getGuatemalaDateParts();

    dateInput.value = `${guatemalaNow.year}-${guatemalaNow.month}-${guatemalaNow.day}`;
    timeInput.value = `${guatemalaNow.hour}:${guatemalaNow.minute}`;

    dateInput.disabled = true;
    timeInput.disabled = true;

    if (helper) {
      helper.textContent = `Se registrará la fecha y hora actuales al guardar (${guatemalaNow.formatted}).`;
      helper.style.display = 'block';
    }
  } else {
    dateInput.disabled = false;
    timeInput.disabled = false;

    if (dateInput.dataset.prevValue !== undefined) {
      dateInput.value = dateInput.dataset.prevValue;
    }

    if (timeInput.dataset.prevValue !== undefined) {
      timeInput.value = timeInput.dataset.prevValue;
    }

    delete dateInput.dataset.prevValue;
    delete timeInput.dataset.prevValue;

    if (helper) {
      helper.style.display = 'none';
    }
  }
}

// Función para limpiar formulario de cambio

function clearChangeForm() {

  resetChangeCurrentTimeControls();

  document.getElementById('changeDescription').value = '';

  // Limpiar campos de fecha y hora

  document.getElementById('changeDate').value = '';

  document.getElementById('changeTime').value = '';

  const checkboxes = document.querySelectorAll('#changePersonnelList input.change-personnel-checkbox');

  checkboxes.forEach(cb => cb.checked = false);

  const evidencesInput = document.getElementById('changeEvidencesInput');

  if (evidencesInput) evidencesInput.value = '';

  selectedEvidencesFiles = [];

  const preview = document.getElementById('changeEvidencesPreview');

  if (preview) preview.innerHTML = '';

  // Limpiar selección de comunidades
  const communityCheckboxes = document.querySelectorAll('#changeCommunitiesList input.change-community-checkbox');
  communityCheckboxes.forEach(cb => cb.checked = false);
  
  const communityItems = document.querySelectorAll('#changeCommunitiesList .community-item');
  communityItems.forEach(item => {
    item.style.borderColor = 'transparent';
    item.style.background = 'rgba(255, 255, 255, 0.05)';
  });

  // Limpiar búsqueda de comunidades
  const communitiesSearch = document.getElementById('changeCommunitiesSearch');
  if (communitiesSearch) communitiesSearch.value = '';

  editingCambioId = null;
  editingCambioGroupId = null;
  editingCambioIds = [];
  
  // Limpiar lista de evidencias a eliminar
  evidenciasAEliminar = [];

  document.getElementById('changeModalTitle').textContent = 'Agregar Cambio';

  document.getElementById('confirmChangeBtn').textContent = 'Agregar';

}

// Función para confirmar eliminación de cambio

function confirmarEliminarCambio(cambioId, cambio) {
  
  // Verificar permisos antes de mostrar el modal
  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }

  const mensaje = cambio 

    ? `¿Estás seguro de que deseas eliminar el cambio "${cambio.descripcion?.substring(0, 50)}..."?`

    : '¿Estás seguro de que deseas eliminar este cambio?';

  // Usar modal de confirmación personalizado (ya muestra el modal internamente)
  showConfirmModal(
    mensaje,
    async () => {
      await eliminarCambio(cambioId);
    }
  );

}

// Función para eliminar cambio

async function eliminarCambio(cambioId) {
  
  // Verificar permisos antes de eliminar
  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {
    showErrorMessage('No se pudo obtener la información del proyecto');
    return;
  }

  try {
    const response = await fetch(`/api/evento/${currentProject.id}/cambio/${cambioId}/eliminar/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': getCookie('csrftoken')
      }
    });

    const result = await response.json();

    if (result.success) {
      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Cambio eliminado exitosamente');
    } else {
      // Lanzar error para que executeConfirmAction lo capture
      throw new Error(result.error || 'Error al eliminar el cambio');
    }

  } catch (error) {
    // Lanzar error para que executeConfirmAction lo capture
    throw new Error(error.message || 'Error al eliminar el cambio. Por favor, intenta de nuevo.');
  }

}
// Función para editar cambio

function editarCambio(cambioId, cambio) {

  if (!cambio) {

    return;

  }

  editingCambioGroupId = cambio.grupo_id || null;
  editingCambioIds = Array.isArray(cambio.ids) && cambio.ids.length ? cambio.ids : [cambioId];
  editingCambioId = editingCambioIds[0] || cambioId;
  // También establecer currentCambioId para que funcione la eliminación de evidencias
  currentCambioId = editingCambioId;

  resetChangeCurrentTimeControls();

  document.getElementById('changeModalTitle').textContent = 'Editar Cambio';

  document.getElementById('confirmChangeBtn').textContent = 'Guardar';

  document.getElementById('changeDescription').value = cambio.descripcion || '';

  // Cargar fecha y hora del cambio si existe
  if (cambio.fecha_cambio) {
    // Extraer fecha y hora directamente del string ISO sin convertir zonas horarias.
    // El backend almacena en zona horaria de Guatemala; si usamos new Date().getHours()
    // aplicamos la zona local del navegador, lo que puede desplazar fecha/hora.
    // Ejemplos de formato recibido: "2026-06-15T22:00:00-06:00" o "2026-06-15T22:00:00Z".
    const iso = String(cambio.fecha_cambio);
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      document.getElementById('changeDate').value = `${year}-${month}-${day}`;
      document.getElementById('changeTime').value = `${hours}:${minutes}`;
    } else {
      // Fallback por si el formato no es el esperado
      const fechaCambio = new Date(iso);
      const year = fechaCambio.getUTCFullYear();
      const month = String(fechaCambio.getUTCMonth() + 1).padStart(2, '0');
      const day = String(fechaCambio.getUTCDate()).padStart(2, '0');
      const hours = String(fechaCambio.getUTCHours()).padStart(2, '0');
      const minutes = String(fechaCambio.getUTCMinutes()).padStart(2, '0');
      document.getElementById('changeDate').value = `${year}-${month}-${day}`;
      document.getElementById('changeTime').value = `${hours}:${minutes}`;
    }
  } else {
    // Si no hay fecha, limpiar los campos
    document.getElementById('changeDate').value = '';
    document.getElementById('changeTime').value = '';
  }

  // Cargar colaborador seleccionado si existe

  const colaboradoresSeleccionados = Array.isArray(cambio.colaboradores_ids) && cambio.colaboradores_ids.length
    ? cambio.colaboradores_ids
    : (cambio.colaborador_id ? [cambio.colaborador_id] : []);

  loadChangePersonnelList().then(() => {
    colaboradoresSeleccionados.forEach((colaboradorId) => {
      const checkbox = document.querySelector(`#changePersonnelList input[value="${colaboradorId}"]`);
      if (checkbox) {
        checkbox.checked = true;
        const item = checkbox.closest('.selection-item');
        if (item) {
          item.classList.add('selected');
        }
      }
    });
  });

  // Cargar comunidades seleccionadas si existen
  // Las comunidades vienen como string separado por comas desde el backend
  if (cambio.comunidades) {
    const comunidadesNombres = cambio.comunidades.split(',').map(c => c.trim()).filter(c => c);
    loadChangeCommunitiesList().then(() => {
      // Buscar y seleccionar las comunidades por nombre
      comunidadesNombres.forEach(comunidadNombre => {
        const communityItems = document.querySelectorAll('#changeCommunitiesList .community-item');
        communityItems.forEach(item => {
          const nameElement = item.querySelector('h4');
          if (nameElement && nameElement.textContent.trim() === comunidadNombre) {
            const checkbox = item.querySelector('.change-community-checkbox');
            if (checkbox) {
              checkbox.checked = true;
              item.style.borderColor = '#007bff';
              item.style.background = 'rgba(0, 123, 255, 0.1)';
            }
          }
        });
      });
    });
  } else {
    // Si no hay comunidades, solo cargar la lista
    loadChangeCommunitiesList();
  }

  // Limpiar evidencias nuevas seleccionadas (para agregar nuevas en la edición)

  selectedEvidencesFiles = [];

  // Cargar evidencias existentes del cambio en el preview

  const preview = document.getElementById('changeEvidencesPreview');

  if (preview) {

    // Inicializar lista de evidencias a eliminar
    evidenciasAEliminar = [];

    renderExistingEvidences(cambio.evidencias || []);

  }

  showModal('addChangeModal');

}

// Función para actualizar descripciones de evidencias existentes que hayan cambiado

async function updateExistingEvidenceDescriptions() {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id || !editingCambioId) {

    return;

  }

  const preview = document.getElementById('changeEvidencesPreview');

  if (!preview) return;

  // Obtener todos los textareas de evidencias existentes

  const existingTextareas = preview.querySelectorAll('.evidence-description-input-existing');

  // Actualizar cada evidencia que haya cambiado

  const updatePromises = Array.from(existingTextareas).map(async (textarea) => {

    const evidenciaId = textarea.getAttribute('data-evidence-id');

    const descripcionOriginal = textarea.getAttribute('data-original-desc') || '';

    const descripcionActual = textarea.value.trim();

    // Solo actualizar si la descripción cambió

    if (descripcionActual !== descripcionOriginal) {

      try {

        const formData = new FormData();

        formData.append('descripcion', descripcionActual);

        const response = await fetch(`/api/evento/${currentProject.id}/cambio/${editingCambioId}/evidencia/${evidenciaId}/actualizar/`, {

          method: 'POST',

          body: formData,

          headers: {

            'X-CSRFToken': getCookie('csrftoken')

          }

        });

        const result = await response.json();

        if (!result.success) {

        }

      } catch (error) {

      }

    }

  });

  // Esperar a que todas las actualizaciones se completen

  await Promise.all(updatePromises);

}
// Función para agregar cambio al proyecto usando API

async function addChangeToProject() {
  
  // Prevenir ejecuciones múltiples
  if (isUploadingChange) {
    return;
  }

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();

    return;

  }

  // Marcar como en proceso
  isUploadingChange = true;
  
  // Deshabilitar botón inmediatamente
  const confirmButton = document.getElementById('confirmChangeBtn');
  const originalLabel = confirmButton ? confirmButton.textContent : null;
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Guardando...';
  }

  const description = document.getElementById('changeDescription').value.trim();

  const selectedPersonnel = getSelectedChangePersonnel();

  if (!description) {
    isUploadingChange = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    showErrorMessage('Por favor ingresa una descripción del cambio');

    return;

  }

  // Validar que se haya seleccionado al menos un colaborador
  if (selectedPersonnel.length === 0) {
    isUploadingChange = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    showErrorMessage('Por favor selecciona al menos un colaborador responsable');
    return;
  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {
    isUploadingChange = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    showErrorMessage('No se pudo obtener la información del proyecto');

    return;

  }

  try {

    const formData = new FormData();

    formData.append('descripcion', description);

    if (editingCambioId && editingCambioGroupId) {
      formData.append('grupo_id', editingCambioGroupId);
    }
    if (editingCambioId && editingCambioIds && editingCambioIds.length) {
      formData.append('cambio_ids', JSON.stringify(editingCambioIds));
    }

    // Agregar fecha y hora si se especificaron o indicar que se use la actual
    const useCurrentTimeCheckbox = document.getElementById('changeUseCurrentTime');
    const useCurrentTime = useCurrentTimeCheckbox ? useCurrentTimeCheckbox.checked : false;

    const fechaCambio = document.getElementById('changeDate').value;
    let horaCambio = document.getElementById('changeTime').value;

    if (useCurrentTime) {
      formData.append('usar_fecha_actual', 'true');
    } else if (fechaCambio) {
      // Si el usuario no digitó hora, usar la hora actual del navegador
      // para que el backend NO tenga que hacer fallback a timezone.now() (que es
      // la hora del servidor, no la que el usuario esperaba).
      if (!horaCambio) {
        const ahora = new Date();
        horaCambio = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        // Reflejar la hora en el input para que el usuario la vea
        const timeInput = document.getElementById('changeTime');
        if (timeInput) timeInput.value = horaCambio;
      }

      // Combinar fecha y hora en formato ISO para enviar al servidor
      // El servidor interpretará esto como hora local y la convertirá a zona horaria de Guatemala
      const fechaHoraISO = `${fechaCambio}T${horaCambio}:00`;
      formData.append('fecha_cambio', fechaHoraISO);
    }

    // Enviar TODOS los colaboradores seleccionados como una lista JSON
    const colaboradoresIds = selectedPersonnel.map(p => p.id);
    const colaboradoresNombres = selectedPersonnel.map(p => p.name || p.nombre || '').filter(n => n);
    
    if (colaboradoresIds.length > 0) {
      formData.append('colaboradores_ids', JSON.stringify(colaboradoresIds));
    } else {
    }

    // Enviar TODAS las comunidades seleccionadas como una lista JSON
    const selectedCommunities = getSelectedChangeCommunities();
    
    // Asegurarse de que los IDs sean strings o números válidos
    const comunidadesIds = selectedCommunities
      .map(c => {
        const id = c.id;
        // Convertir a string si es número, o mantener como string
        const idStr = String(id).trim();
        return idStr;
      })
      .filter(id => id && id !== 'undefined' && id !== 'null' && id !== '');
    
    const comunidadesNombres = selectedCommunities.map(c => c.name || c.nombre || '').filter(n => n);

    if (comunidadesIds.length > 0) {
      formData.append('comunidades_ids', JSON.stringify(comunidadesIds));
    } else {
    }

    // Agregar evidencias marcadas para eliminación (solo al editar)
    if (editingCambioId && evidenciasAEliminar.length > 0) {
      formData.append('evidencias_eliminadas', JSON.stringify(evidenciasAEliminar));
      console.log(`Enviando ${evidenciasAEliminar.length} evidencia(s) para eliminar:`, evidenciasAEliminar);
    }

    // Agregar archivos de evidencias con sus descripciones individuales

    if (selectedEvidencesFiles.length > 0) {

      selectedEvidencesFiles.forEach((fileItem, index) => {

        formData.append(`archivo_${index}`, fileItem.file);

        // Agregar descripción si existe

        if (fileItem.descripcion) {

          formData.append(`descripcion_evidencia_${index}`, fileItem.descripcion);

        }

      });

    }

    const isOffline = !navigator.onLine;
    const db = getOfflineDB();

    if (isOffline && db) {
      // Modo offline: guardar cambio en IndexedDB
      try {
        // Crear objeto de cambio temporal
        const cambioId = editingCambioId || `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fechaCambioInput = document.getElementById('changeDate').value;
        const horaCambioInput = document.getElementById('changeTime').value;
        const useCurrentTimeCheckbox = document.getElementById('changeUseCurrentTime');
        const useCurrentTime = useCurrentTimeCheckbox ? useCurrentTimeCheckbox.checked : false;
        
        let fechaCambio = null;
        if (useCurrentTime) {
          fechaCambio = new Date().toISOString();
        } else if (fechaCambioInput) {
          // Si falta hora, usar hora actual del navegador (mismo comportamiento que online)
          let horaOffline = horaCambioInput;
          if (!horaOffline) {
            const ahora = new Date();
            horaOffline = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
          }
          fechaCambio = `${fechaCambioInput}T${horaOffline}:00`;
        } else {
          fechaCambio = new Date().toISOString();
        }

        // Convertir archivos de evidencias a base64
        const evidenciasBase64 = [];
        for (let i = 0; i < selectedEvidencesFiles.length; i++) {
          const fileItem = selectedEvidencesFiles[i];
          try {
            const base64 = await fileToBase64(fileItem.file);
            evidenciasBase64.push({
              nombre: fileItem.file.name,
              descripcion: fileItem.descripcion || '',
              base64: base64,
              tipo: fileItem.file.type,
              tamanio: fileItem.file.size
            });
          } catch (error) {
            console.warn('Error al convertir archivo a base64:', error);
          }
        }

        // Obtener nombres de colaboradores y comunidades para mostrar
        // Primero intentar desde los datos seleccionados (más confiable)
        let responsablesNombres = colaboradoresNombres.length > 0 
          ? colaboradoresNombres 
          : [];
        let comunidadesNombresTexto = comunidadesNombres.length > 0 
          ? comunidadesNombres.join(', ') 
          : '';

        // Si no hay nombres, intentar obtener desde IndexedDB
        if (responsablesNombres.length === 0 && colaboradoresIds.length > 0) {
          const db = getOfflineDB();
          if (db) {
            try {
              for (const colId of colaboradoresIds) {
                try {
                  const colaborador = await db.get('colaboradores', colId);
                  if (colaborador && (colaborador.nombre || colaborador.nombres)) {
                    responsablesNombres.push(colaborador.nombre || colaborador.nombres);
                  }
                } catch (error) {
                  // Ignorar errores individuales
                }
              }
            } catch (error) {
              console.warn('⚠️ Error al obtener nombres de colaboradores desde IndexedDB:', error);
            }
          }
        }

        if (!comunidadesNombresTexto && comunidadesIds.length > 0) {
          const db = getOfflineDB();
          if (db) {
            try {
              const nombresComunidades = [];
              for (const comId of comunidadesIds) {
                try {
                  const comunidad = await db.get('comunidades', comId);
                  if (comunidad && comunidad.nombre) {
                    nombresComunidades.push(comunidad.nombre);
                  }
                } catch (error) {
                  // Ignorar errores individuales
                }
              }
              if (nombresComunidades.length > 0) {
                comunidadesNombresTexto = nombresComunidades.join(', ');
              }
            } catch (error) {
              console.warn('⚠️ Error al obtener nombres de comunidades desde IndexedDB:', error);
            }
          }
        }

        const nuevoCambio = {
          id: cambioId,
          descripcion: description,
          fecha_cambio: fechaCambio,
          fecha_display: fechaCambio ? new Date(fechaCambio).toLocaleString('es-GT', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
          colaboradores_ids: colaboradoresIds,
          responsables_display: responsablesNombres.join(', ') || 'Sin responsable',
          comunidades_ids: comunidadesIds,
          comunidades_nombres: comunidadesNombresTexto,
          evidencias: evidenciasBase64,
          es_offline: true,
          creado_en: new Date().toISOString(),
          modificado_offline: true
        };

        // Actualizar proyecto en IndexedDB
        if (!currentProject.cambios) {
          currentProject.cambios = [];
        }
        
        if (editingCambioId) {
          // Editar cambio existente
          const index = currentProject.cambios.findIndex(c => c.id === editingCambioId);
          if (index !== -1) {
            currentProject.cambios[index] = { ...currentProject.cambios[index], ...nuevoCambio };
          } else {
            currentProject.cambios.push(nuevoCambio);
          }
        } else {
          // Agregar nuevo cambio
          currentProject.cambios.push(nuevoCambio);
        }

        currentProject.modificado_offline = true;
        currentProject.ultimo_sync = new Date().toISOString();

        await db.saveProyecto(currentProject);

        // Actualizar vista inmediatamente
        currentProjectData = currentProject;
        await renderCambios(currentProject.cambios);

        // Limpiar formulario
        editingCambioId = null;
        editingCambioGroupId = null;
        editingCambioIds = [];
        evidenciasAEliminar = [];
        hideModal('addChangeModal');
        clearChangeForm();

        showSuccessMessage('Cambio guardado sin conexión. Se enviará automáticamente cuando vuelva el internet.');

        // Intentar agregar a la cola de sincronización
        // Convertir archivos de evidencias a base64 para poder serializarlos
        const csrfToken = getCookie('csrftoken');
        if (window.OfflineSync && window.OfflineSync.enqueueManual && csrfToken) {
          try {
            // Convertir archivos de evidencias a base64
            const filesBase64 = [];
            const fieldsArray = [];
            
            for (let i = 0; i < selectedEvidencesFiles.length; i++) {
              const fileItem = selectedEvidencesFiles[i];
              try {
                const base64 = await fileToBase64(fileItem.file);
                filesBase64.push({
                  key: `archivo_${i}`,
                  fileName: fileItem.file.name,
                  fileType: fileItem.file.type,
                  base64: base64
                });
                if (fileItem.descripcion) {
                  fieldsArray.push({
                    key: `descripcion_evidencia_${i}`,
                    value: fileItem.descripcion
                  });
                }
              } catch (error) {
                console.warn(`Error al convertir archivo ${fileItem.file.name} a base64:`, error);
              }
            }

            // Agregar campos de texto
            fieldsArray.push({ key: 'descripcion', value: description });
            if (editingCambioId && editingCambioGroupId) {
              fieldsArray.push({ key: 'grupo_id', value: editingCambioGroupId });
            }
            if (editingCambioId && editingCambioIds && editingCambioIds.length) {
              fieldsArray.push({ key: 'cambio_ids', value: JSON.stringify(editingCambioIds) });
            }
            if (useCurrentTime) {
              fieldsArray.push({ key: 'usar_fecha_actual', value: 'true' });
            } else if (fechaCambio) {
              let horaSync = horaCambio;
              if (!horaSync) {
                const ahora = new Date();
                horaSync = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
              }
              fieldsArray.push({ key: 'fecha_cambio', value: `${fechaCambio}T${horaSync}:00` });
            }
            if (colaboradoresIds.length > 0) {
              fieldsArray.push({ key: 'colaboradores_ids', value: JSON.stringify(colaboradoresIds) });
            }
            if (comunidadesIds.length > 0) {
              fieldsArray.push({ key: 'comunidades_ids', value: JSON.stringify(comunidadesIds) });
            }
            if (editingCambioId && evidenciasAEliminar.length > 0) {
              fieldsArray.push({ key: 'evidencias_eliminadas', value: JSON.stringify(evidenciasAEliminar) });
            }

            // Crear objeto body con campos de texto y archivos
            const bodyData = {
              type: 'formdata',
              files: filesBase64,
              fields: fieldsArray
            };

            const url = editingCambioId 
              ? `/api/evento/${currentProject.id}/cambio/${editingCambioId}/actualizar/`
              : `/api/evento/${currentProject.id}/cambio/crear/`;

            window.OfflineSync.enqueueManual(url, {
              method: 'POST',
              headers: {
                'X-CSRFToken': csrfToken
              },
              body: bodyData
            });
            console.log('✅ Cambio agregado a la cola de sincronización');
          } catch (error) {
            console.error('❌ Error al agregar cambio a la cola:', error);
          }
          if (window.OfflineSync.updateSyncStatus) {
            window.OfflineSync.updateSyncStatus();
          }
        }

        isUploadingChange = false;
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.textContent = originalLabel || 'Agregar';
        }

        return;
      } catch (error) {
        console.error('Error al guardar cambio offline:', error);
        showErrorMessage('Error al guardar el cambio offline. Por favor, intenta de nuevo.');
        isUploadingChange = false;
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.textContent = originalLabel || 'Agregar';
        }
        return;
      }
    }

    const url = editingCambioId 

      ? `/api/evento/${currentProject.id}/cambio/${editingCambioId}/actualizar/`

      : `/api/evento/${currentProject.id}/cambio/crear/`;

    // Log de todos los datos del FormData
    for (let key of formData.keys()) {
      const value = formData.get(key);
      if (key === 'comunidades_ids') {
        try {
          const parsed = JSON.parse(value);
        } catch (e) {
        }
      } else if (key === 'colaboradores_ids') {
        try {
          const parsed = JSON.parse(value);
        } catch (e) {
        }
      } else {
      }
    }
    
    // Verificación específica de comunidades
    const comunidadesEnFormData = formData.get('comunidades_ids');
    if (comunidadesEnFormData) {
    } else {
    }

    const response = await fetch(url, {
      credentials: 'include',
      method: 'POST',

      body: formData,

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    const result = await response.json();

    if (result.success) {

      // Si estamos editando, actualizar las descripciones de evidencias existentes que hayan cambiado

      if (editingCambioId) {

        await updateExistingEvidenceDescriptions();

      }

      editingCambioId = null;
      editingCambioGroupId = null;
      editingCambioIds = [];
      
      // Limpiar lista de evidencias a eliminar
      evidenciasAEliminar = [];

      hideModal('addChangeModal');

      clearChangeForm();

      // Actualizar la vista en tiempo real
      // Nota: editingCambioId ya fue puesto en null arriba, así que siempre mostrará 'Cambio agregado'
      // Esto es correcto porque ya limpiamos las variables de edición
      const mensaje = 'Cambio guardado exitosamente';
      await refreshCurrentProject(mensaje);

    } else {

      showErrorMessage(result.error || 'Error al guardar el cambio');

    }

  } catch (error) {

    showErrorMessage('Error al guardar el cambio. Por favor, intenta de nuevo.');

  } finally {
    
    // Liberar el flag
    isUploadingChange = false;
    
    // Restaurar botón
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    
  }

}

// Las funciones clearImageForm, handleImageSelect y addImageToProject ya están definidas arriba

// Las funciones showEditDescriptionModal y updateProjectDescription ya están definidas arriba

async function showAddCommunityModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  showModal('addCommunityModal');

  await loadCommunitiesList();

}

// Función para limpiar formulario de comunidad

function clearCommunityForm() {

  const searchInput = document.getElementById('communitySearch');

  if (searchInput) searchInput.value = '';

  selectedCommunityIds = new Set();

  renderCommunitiesList();

  renderSelectedCommunityChips();

}

// Función para guardar las comunidades seleccionadas en el proyecto

async function addCommunityToProject() {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('No se pudo obtener la información del proyecto.');

    return;

  }

  const selectedCommunities = getSelectedCommunities();

  if (selectedCommunities.length === 0) {

    showErrorMessage('Por favor selecciona al menos una comunidad');

    return;

  }

  // Preservar fechas de agregado de las comunidades que ya existían

  const projectCommunities = [

    ...(Array.isArray(currentProject.comunidades) ? currentProject.comunidades : []),

    ...(Array.isArray(currentProject.communities) ? currentProject.communities : [])

  ];

  const existingById = {};

  projectCommunities.forEach(c => {

    const id = String(c.comunidad_id || c.id || '');

    if (id) existingById[id] = c;

  });

  const comunidadesPayload = selectedCommunities.map(community => {

    const existing = existingById[community.id];

    return {

      comunidad_id: community.id,

      region_id: community.region_id || '',

      agregado_en: existing?.agregado_en || null

    };

  });

  try {

    const formData = new FormData();

    formData.append('comunidades_seleccionadas', JSON.stringify(comunidadesPayload));

    formData.append('comunidad_id', comunidadesPayload[0].comunidad_id);

    const response = await fetch(`/api/evento/${currentProject.id}/actualizar/`, {

      method: 'POST',

      credentials: 'include',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {

      showErrorMessage('Error del servidor. Por favor, intenta de nuevo.');

      return;

    }

    const result = await response.json();

    if (result.success) {

      await loadProjectDetails(currentProject.id);

      showSuccessMessage(`${selectedCommunities.length} comunidad(es) guardada(s) exitosamente`);

      hideModal('addCommunityModal');

    } else {

      showErrorMessage(result.error || 'Error al guardar las comunidades.');

    }

  } catch (error) {

    console.error('❌ Error guardando comunidades:', error);

    showErrorMessage('Error al guardar las comunidades. Por favor, intenta de nuevo.');

  }

}

// Función para mostrar modal de agregar personal

async function showAddPersonnelModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  showModal('addPersonnelModal');

  await loadPersonnelListFromAPI();

  // Configurar búsqueda de personal

  const searchInput = document.getElementById('personnelSearch');

  if (searchInput) {

    searchInput.value = '';

    // Remover listeners anteriores para evitar duplicados

    const newSearchInput = searchInput.cloneNode(true);

    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', filterPersonnelList);

  }

}

// Función para cargar colaboradores desde la API

async function loadPersonnelListFromAPI() {

  const personnelList = document.getElementById('personnelList');

  if (!personnelList) return;

  personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #6c757d;">Cargando colaboradores...</div>';

  try {

    const response = await fetch('/api/personal/');

    if (!response.ok) {

      throw new Error('Error al cargar colaboradores');

    }

    const colaboradores = await response.json();

    if (colaboradores.length === 0) {

      personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #6c757d;">No hay colaboradores disponibles.</div>';

      return;

    }

    // Obtener el proyecto actual para ver qué personal ya está asignado

    const currentProject = getCurrentProject();

    const personalAsignadoIds = currentProject && currentProject.personal 

      ? currentProject.personal.map(p => p.id || p.colaborador_id || p.usuario_id).filter(Boolean)

      : [];

    personnelList.innerHTML = colaboradores.map(colaborador => {

      const isSelected = personalAsignadoIds.includes(colaborador.id);

      return `

        <div class="personnel-item" data-personnel-id="${colaborador.id}" data-personnel-type="${colaborador.tipo || 'colaborador'}" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: pointer; border: 2px solid ${isSelected ? '#007bff' : 'transparent'}; ${isSelected ? 'background: rgba(0, 123, 255, 0.1);' : ''}">

          <input type="checkbox" class="personnel-checkbox" data-personnel-id="${colaborador.id}" ${isSelected ? 'checked disabled' : ''} style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">

          <div style="flex: 1;">

            <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1rem;">${colaborador.nombre || 'Sin nombre'}</h4>

            <p style="margin: 2px 0; color: #007bff; font-size: 0.9rem;">${colaborador.puesto || 'Sin puesto'}</p>

            <p style="margin: 2px 0; color: #b8c5d1; font-size: 0.85rem;">${colaborador.rol_display || 'Colaborador'}</p>

            ${isSelected ? '<p style="margin: 4px 0 0 0; color: #ffc107; font-size: 0.8rem;">✓ Ya asignado</p>' : ''}

          </div>

        </div>

      `;

    }).join('');

    // Agregar event listeners a los checkboxes

    personnelList.querySelectorAll('.personnel-checkbox').forEach(checkbox => {

      checkbox.addEventListener('change', function() {

        const item = this.closest('.personnel-item');

        if (this.checked) {

          item.style.borderColor = '#007bff';

          item.style.background = 'rgba(0, 123, 255, 0.1)';

        } else {

          item.style.borderColor = 'transparent';

          item.style.background = 'rgba(255, 255, 255, 0.05)';

        }

      });

    });

  } catch (error) {

    personnelList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error al cargar colaboradores. Por favor, intenta de nuevo.</div>';

  }

}

// Función para limpiar formulario de personal

function clearPersonnelForm() {

  document.getElementById('personnelName').value = '';

  document.getElementById('personnelRole').value = '';

}
// Función para agregar personal al proyecto

async function addPersonnelToProject() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  const selectedPersonnel = getSelectedPersonnel();

  if (selectedPersonnel.length === 0) {

    showErrorMessage('Por favor selecciona al menos un colaborador');

    return;

  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  try {

    // Obtener el personal actual del evento

    const currentPersonnel = currentProject.personal || [];

    const currentPersonnelIds = currentPersonnel.map(p => p.id || p.colaborador_id || p.usuario_id).filter(Boolean);

    // Preparar el nuevo personal a agregar (solo los que no están ya asignados)

    const newPersonnel = selectedPersonnel.filter(p => !currentPersonnelIds.includes(p.id));

    if (newPersonnel.length === 0) {

      showErrorMessage('Los colaboradores seleccionados ya están asignados al evento.');

      return;

    }

    // Preparar el formato para la API

    const personalIds = [

      ...currentPersonnel.map(p => ({

        id: p.id || p.colaborador_id || p.usuario_id,

        tipo: p.tipo || 'colaborador',

        rol: p.rol || 'Colaborador'

      })),

      ...newPersonnel.map(p => ({

        id: p.id,

        tipo: p.tipo,

        rol: 'Colaborador'

      }))

    ];

    // Crear FormData para enviar a la API

    const formData = new FormData();

    formData.append('personal_ids', JSON.stringify(personalIds));

    // Llamar a la API de actualizar evento

    const response = await fetch(`/api/evento/${currentProject.id}/actualizar/`, {

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    const result = await response.json();

    if (result.success) {

      // Recargar los detalles del evento

      shouldRefreshLatestProjects = true;
      hideModal('addPersonnelModal');

      // Actualizar la vista en tiempo real
      await refreshCurrentProject(`${newPersonnel.length} colaborador(es) agregado(s) exitosamente`);

    } else {

      showErrorMessage(result.error || 'Error al agregar personal al evento.');

    }

  } catch (error) {

    showErrorMessage('Error al agregar personal. Por favor, intenta de nuevo.');

  }

}

// Función para obtener el token CSRF

function getCookie(name) {

  let cookieValue = null;

  if (document.cookie && document.cookie !== '') {

    const cookies = document.cookie.split(';');

    for (let i = 0; i < cookies.length; i++) {

      const cookie = cookies[i].trim();

      if (cookie.substring(0, name.length + 1) === (name + '=')) {

        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));

        break;

      }

    }

  }

  return cookieValue;

}
// Event listeners

document.addEventListener('DOMContentLoaded', function() {

  // Delegación de eventos para botones de modales (backup en caso de que los listeners directos fallen)
  document.body.addEventListener('click', function(e) {
    const target = e.target;

    // NOTA: El handler para #confirmDeleteBtn se registra directamente sobre
    // el botón más abajo (línea ~9762) en capture phase, así que NO hace
    // falta delegación aquí (generaba doble ejecución y stopPropagation que
    // bloqueaba la respuesta al click en algunos navegadores).

    // Verificar si es el botón de agregar imagen
    if (target.id === 'confirmImageBtn' || target.closest('#confirmImageBtn')) {
      e.preventDefault();
      e.stopPropagation();
      // Verificar que el botón no esté deshabilitado (ya procesando)
      const btn = target.id === 'confirmImageBtn' ? target : target.closest('#confirmImageBtn');
      if (btn && btn.disabled) {
        return;
      }
      addImageToProject();
      return;
    }
    
    // Verificar si es el botón de guardar descripción
    if (target.id === 'confirmDescriptionBtn' || target.closest('#confirmDescriptionBtn')) {
      e.preventDefault();
      e.stopPropagation();
      updateProjectDescription();
      return;
    }
    
    // Verificar si es el botón de guardar datos
    if (target.id === 'confirmDataBtn' || target.closest('#confirmDataBtn')) {
      e.preventDefault();
      e.stopPropagation();
      saveProjectData();
      return;
    }
    
    // Verificar si es el botón de agregar cambio
    if (target.id === 'confirmChangeBtn' || target.closest('#confirmChangeBtn')) {
      e.preventDefault();
      e.stopPropagation();
      // Verificar que el botón no esté deshabilitado (ya procesando)
      const btn = target.id === 'confirmChangeBtn' ? target : target.closest('#confirmChangeBtn');
      if (btn && btn.disabled) {
        return;
      }
      addChangeToProject();
      return;
    }
    
    // Verificar si es el botón de agregar archivo del proyecto
    if (target.id === 'confirmFileBtn' || target.closest('#confirmFileBtn')) {
      e.preventDefault();
      e.stopPropagation();
      // Verificar que el botón no esté deshabilitado (ya procesando)
      const btn = target.id === 'confirmFileBtn' ? target : target.closest('#confirmFileBtn');
      if (btn && btn.disabled) {
        return;
      }
      addFileToProject();
      return;
    }
    
    // Verificar si es el botón de guardar descripción de archivo
    if (target.id === 'confirmFileDescriptionBtn' || target.closest('#confirmFileDescriptionBtn')) {
      e.preventDefault();
      e.stopPropagation();
      updateProjectFileDescription();
      return;
    }
    
    // Verificar si es el botón de editar archivo
    if (target.classList.contains('file-edit-btn') || target.closest('.file-edit-btn')) {
      e.preventDefault();
      e.stopPropagation();
      const btn = target.classList.contains('file-edit-btn') ? target : target.closest('.file-edit-btn');
      const archivoId = btn.getAttribute('data-edit-archivo-id');
      const descripcion = btn.getAttribute('data-archivo-descripcion');
      const decoded = descripcion ? decodeURIComponent(descripcion) : '';
      showEditProjectFileDescriptionModal(archivoId, decoded);
      return;
    }
    
    // Verificar si es el botón de eliminar archivo (btn-danger con data-archivo-id)
    if ((target.classList.contains('btn-danger') || target.closest('.btn-danger')) && 
        (target.hasAttribute('data-archivo-id') || target.closest('[data-archivo-id]'))) {
      e.preventDefault();
      e.stopPropagation();
      const btn = target.hasAttribute('data-archivo-id') ? target : target.closest('[data-archivo-id]');
      const archivoId = btn.getAttribute('data-archivo-id');
      
      // Obtener el nombre del archivo para el mensaje de confirmación
      const fileItem = btn.closest('.file-item');
      const fileNameElement = fileItem ? fileItem.querySelector('.file-info h4 a, .file-info h4 span') : null;
      const fileName = fileNameElement ? fileNameElement.textContent.trim() : 'este archivo';

      // Mostrar modal de confirmación
      showConfirmDeleteModal(
        `¿Estás seguro de que deseas eliminar el archivo "${fileName}"? Esta acción no se puede deshacer.`,
        async () => {
          await eliminarArchivoProyecto(archivoId);
        }
      );
      return;
    }
  });
  
  // Delegación de eventos para inputs de archivo (backup)
  document.body.addEventListener('change', function(e) {
    const target = e.target;
    
    // Verificar si es el input de imágenes
    if (target.id === 'imageFileInput') {
      handleImageSelect(e);
      return;
    }
    
    // Verificar si es el input de evidencias de cambios
    if (target.id === 'changeEvidencesInput') {
      handleChangeEvidencesSelect(e);
      return;
    }
    
    // Verificar si es el input de archivos del proyecto
    if (target.id === 'fileInput') {
      handleFileSelect(e);
      return;
    }
  });

  // Verificar si hay una búsqueda pendiente desde el buscador principal
  if (typeof sessionStorage !== 'undefined') {
    const searchQuery = sessionStorage.getItem('projectSearchQuery');
    const showList = sessionStorage.getItem('showProjectsList');
    
    if (showList === 'true') {
      // Limpiar el flag
      sessionStorage.removeItem('showProjectsList');
      
      // Función para aplicar la búsqueda pendiente
      const applyPendingSearch = () => {
        // Verificar que los proyectos estén cargados
        const allProjectsLoaded = projectsData.capacitaciones.length > 0 || 
                                  projectsData.entregas.length > 0 || 
                                  projectsData['proyectos-ayuda'].length > 0;
        
        if (!allProjectsLoaded) {
          // Esperar un poco más si los proyectos aún no están cargados
          setTimeout(applyPendingSearch, 300);
          return;
        }
        
        // Mostrar la vista de listado
        showListView();
        
        // Aplicar la búsqueda si existe
        if (searchQuery) {
          sessionStorage.removeItem('projectSearchQuery');
          
          // Esperar a que se renderice la lista
          setTimeout(() => {
            const searchInput = document.getElementById('projectSearchInput');
            if (searchInput) {
              searchInput.value = searchQuery;
              filterProjectsBySearch(searchQuery);
              
              // Mostrar el botón de limpiar si hay texto
              const searchClearBtn = document.getElementById('searchClearBtn');
              if (searchClearBtn && searchQuery.trim()) {
                searchClearBtn.style.display = 'flex';
              }
            }
          }, 300);
        }
      };
      
      // Esperar a que los proyectos se carguen antes de aplicar la búsqueda
      setTimeout(applyPendingSearch, 800);
    }
  }

  // Manejar anclas de URL al cargar la página

  handleUrlAnchor();

  // Botones "Ver todos" por categoría

  document.querySelectorAll('.btn-ver-todos').forEach(button => {

    button.addEventListener('click', function() {

      const category = this.getAttribute('data-category');

      showListView(category);

    });

  });

  // Botón "Ver todos los eventos"

  const verTodosBtn = document.querySelector('.btn-ver-todos-eventos');

  if (verTodosBtn) {

    verTodosBtn.addEventListener('click', function() {

      showListView();

    });

  }

  // Configurar event listeners para el buscador

  const searchInput = document.getElementById('projectSearchInput');

  const searchClearBtn = document.getElementById('searchClearBtn');

  if (searchInput) {

    // Event listener para filtrar mientras se escribe

    searchInput.addEventListener('input', function(e) {

      const searchTerm = e.target.value;

      // Mostrar/ocultar botón de limpiar

      if (searchClearBtn) {

        if (searchTerm.trim() !== '') {

          searchClearBtn.style.display = 'flex';

        } else {

          searchClearBtn.style.display = 'none';

        }

      }

      // Filtrar proyectos

      filterProjectsBySearch(searchTerm);
      
      // NO sincronizar con el buscador principal - cada buscador funciona independientemente

    });

    // Event listener para limpiar búsqueda

    if (searchClearBtn) {

      searchClearBtn.addEventListener('click', function() {

        searchInput.value = '';

        searchClearBtn.style.display = 'none';

        filterProjectsBySearch('');

      });

    }

  }

  const typeFilter = document.getElementById('projectTypeFilter');

  if (typeFilter) {

    typeFilter.addEventListener('change', function(e) {

      const { value } = e.target;

      currentListViewTypeFilter = value || 'all';

      applyProjectListFilters();

    });

  }

  // Botón de regreso

  const btnBack = document.getElementById('btnBack');

  if (btnBack) {

    btnBack.addEventListener('click', function() {

      showMainView();

    });

  }

  // Botón "Agregar nuevo"

  const btnAgregarNuevo = document.getElementById('btnAgregarNuevo');
  if (btnAgregarNuevo) {
    btnAgregarNuevo.addEventListener('click', function() {
      // Redirigir directamente a la página de gestión de eventos con scroll automático al formulario de creación
      if (window.DJANGO_URLS && window.DJANGO_URLS.gestioneseventos) {
        window.location.href = window.DJANGO_URLS.gestioneseventos + '#createEventView';
      }
    });
  }

  // Escuchar cambios en el hash de la URL

  window.addEventListener('hashchange', function() {

    handleUrlAnchor();

  });

  // Agregar event listeners cuando se cargue la página

  addViewMoreListeners();

  // Event delegation para botones "Ver más"

  document.addEventListener('click', function(e) {

    // Verificar si es un botón "Ver más"

    if (e.target.classList.contains('project-btn')) {

      e.preventDefault();

      const projectId = e.target.getAttribute('data-project-id');

      if (projectId) {

        showProjectDetail(projectId);

      } else {

      }

    }

  });

  // Verificar que los elementos existan

  setTimeout(() => {

    const projectCards = document.querySelectorAll('.project-card');

    const listItems = document.querySelectorAll('.list-item-btn');

    const verTodosBtns = document.querySelectorAll('.btn-ver-todos');

    const verTodosEventosBtn = document.querySelector('.btn-ver-todos-eventos');

  }, 1000);

  // ======= EVENT LISTENERS PARA LOS NUEVOS BOTONES =======

  // Inicializar datos del proyecto actual

  currentProjectData = getCurrentProject();

  // Botón Editar Evento - Solo visible para admin

  const editEventBtn = document.getElementById('editEventBtn');

  if (editEventBtn) {

    // Verificar si el usuario es admin desde el contexto de Django

    // El contexto se pasa a través de una variable global o data attribute

    const isAdmin = editEventBtn.dataset.isAdmin === 'true' || 

                    (window.USER_AUTH && window.USER_AUTH.isAuthenticated && window.USER_AUTH.isAdmin) ||

                    (typeof usuario_maga !== 'undefined' && usuario_maga && usuario_maga.es_admin);

    if (!isAdmin) {

      // Ocultar el botón si no es admin

      editEventBtn.style.display = 'none';

    } else {

      // Mostrar y configurar el botón solo para admin

      editEventBtn.style.display = 'flex';

      editEventBtn.addEventListener('click', function() {

        const currentProject = getCurrentProject();

        if (!currentProject || !currentProject.id) {

          showErrorMessage('Error: No se pudo obtener la información del evento.');

          return;

        }

        // Redirigir a la página de gestión de eventos con el ID del evento para editarlo directamente

        const eventoId = currentProject.id;

        window.location.href = `${window.DJANGO_URLS.gestioneseventos}#createEventView&evento=${eventoId}`;

      });

    }

  }

  // Botón Generar Reporte

  const generateReportBtn = document.getElementById('generateReportBtn');

  if (generateReportBtn) {
    generateReportBtn.addEventListener('click', function() {
      const currentProject = getCurrentProject();

      if (!currentProject || !currentProject.id) {
        showErrorMessage('No se pudo obtener la información del evento para generar el reporte.');
        return;
      }

      const baseReportesUrl = (window.DJANGO_URLS && window.DJANGO_URLS.reportes) || '/reportes/';
      let targetUrl;

      try {
        targetUrl = new URL(baseReportesUrl, window.location.origin);
      } catch (error) {
        targetUrl = new URL('/reportes/', window.location.origin);
      }

      targetUrl.searchParams.set('reporte', 'reporte-evento-individual');
      targetUrl.searchParams.set('evento', currentProject.id);

      window.location.href = targetUrl.toString();
    });
  }

  // Botones de agregar elementos

  // Los botones de agregar/quitar comunidad han sido removidos según solicitud del usuario

  ensureProjectActionHandlers();

  // Event listeners para modales (ya están definidos más abajo)

  // Event listeners para credenciales

  const verifyCredentialsBtn = document.getElementById('verifyCredentialsBtn');

  if (verifyCredentialsBtn) {

    verifyCredentialsBtn.addEventListener('click', verifyCredentials);

  }

  const cancelCredentialsBtn = document.getElementById('cancelCredentialsBtn');

  if (cancelCredentialsBtn) {

    cancelCredentialsBtn.addEventListener('click', function() {

      // Limpiar campos antes de cerrar

      document.getElementById('adminUsername').value = '';

      document.getElementById('adminPassword').value = '';

      hideModal('adminCredentialsModal');

    });

  }

  const closeCredentialsModal = document.getElementById('closeCredentialsModal');

  if (closeCredentialsModal) {

    closeCredentialsModal.addEventListener('click', function() {

      // Limpiar campos antes de cerrar

      document.getElementById('adminUsername').value = '';

      document.getElementById('adminPassword').value = '';

      hideModal('adminCredentialsModal');

    });

  }

  // Event listener para selección de imagen

  const imageFileInput = document.getElementById('imageFileInput');

  if (imageFileInput) {
    imageFileInput.addEventListener('change', handleImageSelect);

  } else {
  }

  // Event listeners para cerrar modales

  const closeImageModal = document.getElementById('closeImageModal');

  if (closeImageModal) {

    closeImageModal.addEventListener('click', () => hideModal('addImageModal'));

  }

  // Event listener para cerrar modal de imagen en tamaño completo

  const closeImageViewModalBtn = document.getElementById('closeImageViewModal');

  if (closeImageViewModalBtn) {

    closeImageViewModalBtn.addEventListener('click', closeImageViewModal);

  }

  // Event listener para expandir portada desde el boton de la imagen principal
  const coverExpandBtn = document.getElementById('coverExpandBtn');
  const detailMainImage = document.getElementById('detailMainImage');
  if (coverExpandBtn && detailMainImage) {
    coverExpandBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const src = detailMainImage.src;
      if (src && !src.includes('unsplash.com')) {
        showImageViewModal(src, 'Portada del proyecto');
      } else if (src) {
        showImageViewModal(src, 'Imagen del proyecto');
      }
    });
    // Tambien permitir clic en la imagen para expandir (opcional, mas intuitivo)
    detailMainImage.style.cursor = 'zoom-in';
    detailMainImage.addEventListener('click', function(e) {
      if (coverExpandBtn && coverExpandBtn.offsetParent !== null) {
        coverExpandBtn.click();
      }
    });
  }

  // Event listener para cerrar modal de imagen al hacer clic fuera del contenido

  const imageViewModal = document.getElementById('imageViewModal');

  if (imageViewModal) {

    imageViewModal.addEventListener('click', function(e) {

      // Cerrar si se hace clic fuera del contenido del modal

      if (e.target === imageViewModal) {

        closeImageViewModal();

      }

    });

  }

  // Navegacion del lightbox
  const lightboxPrevBtn = document.getElementById('lightboxPrevBtn');
  const lightboxNextBtn = document.getElementById('lightboxNextBtn');
  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); imageViewNavigate(-1); });
  }
  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener('click', (e) => { e.stopPropagation(); imageViewNavigate(1); });
  }

  // Acciones del lightbox (editar descripcion y usar como portada)
  const btnEditImageDescription = document.getElementById('btnEditImageDescription');
  const btnSetAsCover = document.getElementById('btnSetAsCover');
  if (btnEditImageDescription) {
    btnEditImageDescription.addEventListener('click', (e) => {
      e.stopPropagation();
      const imageId = btnEditImageDescription.dataset.imageId;
      if (imageId) openEditImageDescriptionModal(imageId);
    });
  }
  if (btnSetAsCover) {
    btnSetAsCover.addEventListener('click', (e) => {
      e.stopPropagation();
      const imageId = btnSetAsCover.dataset.imageId;
      if (imageId) setGalleryImageAsCover(imageId);
    });
  }

  // Modal galeria completa
  const viewGalleryFullBtn = document.getElementById('viewGalleryFullBtn');
  const closeGalleryFullModalBtn = document.getElementById('closeGalleryFullModal');
  const galleryFullModal = document.getElementById('galleryFullModal');
  if (viewGalleryFullBtn) {
    viewGalleryFullBtn.addEventListener('click', openGalleryFullModal);
  }
  if (closeGalleryFullModalBtn) {
    closeGalleryFullModalBtn.addEventListener('click', closeGalleryFullModal);
  }
  if (galleryFullModal) {
    galleryFullModal.addEventListener('click', function(e) {
      if (e.target === galleryFullModal) {
        closeGalleryFullModal();
      }
    });
  }

  // Modal editar descripcion de imagen
  const closeEditImageDescriptionModalBtn = document.getElementById('closeEditImageDescriptionModal');
  const cancelEditImageDescriptionBtn = document.getElementById('cancelEditImageDescriptionBtn');
  const confirmEditImageDescriptionBtn = document.getElementById('confirmEditImageDescriptionBtn');
  if (closeEditImageDescriptionModalBtn) {
    closeEditImageDescriptionModalBtn.addEventListener('click', () => hideModal('editImageDescriptionModal'));
  }
  if (cancelEditImageDescriptionBtn) {
    cancelEditImageDescriptionBtn.addEventListener('click', () => hideModal('editImageDescriptionModal'));
  }
  if (confirmEditImageDescriptionBtn) {
    confirmEditImageDescriptionBtn.addEventListener('click', saveImageDescription);
  }

  // Event listener para cerrar modal de imagen con tecla ESC

  document.addEventListener('keydown', function(e) {

    if (e.key === 'Escape') {

      const imageViewModal = document.getElementById('imageViewModal');

      if (imageViewModal && imageViewModal.classList.contains('active')) {

        closeImageViewModal();

      }

      const galleryFullModalActive = document.getElementById('galleryFullModal');
      if (galleryFullModalActive && galleryFullModalActive.classList.contains('active')) {
        closeGalleryFullModal();
      }

    }

  });

  const closeDescriptionModal = document.getElementById('closeDescriptionModal');

  if (closeDescriptionModal) {

    closeDescriptionModal.addEventListener('click', () => hideModal('editDescriptionModal'));

  }

  const closeDataModal = document.getElementById('closeDataModal');

  if (closeDataModal) {

    closeDataModal.addEventListener('click', () => hideModal('editDataModal'));

  }

  const closeCommunityModal = document.getElementById('closeCommunityModal');

  if (closeCommunityModal) {

    closeCommunityModal.addEventListener('click', () => hideModal('addCommunityModal'));

  }

  const closePersonnelModal = document.getElementById('closePersonnelModal');

  if (closePersonnelModal) {

    closePersonnelModal.addEventListener('click', () => hideModal('addPersonnelModal'));

  }

  const closeChangeModal = document.getElementById('closeChangeModal');

  if (closeChangeModal) {

    closeChangeModal.addEventListener('click', () => {

      clearChangeForm();

      hideModal('addChangeModal');

    });

  }

  // Event listeners para botones de cancelar

  const cancelImageBtn = document.getElementById('cancelImageBtn');

  if (cancelImageBtn) {

    cancelImageBtn.addEventListener('click', () => {

      clearImageForm();

      hideModal('addImageModal');

    });

  }

  const cancelDescriptionBtn = document.getElementById('cancelDescriptionBtn');

  if (cancelDescriptionBtn) {

    cancelDescriptionBtn.addEventListener('click', () => hideModal('editDescriptionModal'));

  }

  const cancelDataBtn = document.getElementById('cancelDataBtn');

  if (cancelDataBtn) {

    cancelDataBtn.addEventListener('click', () => hideModal('editDataModal'));

  }

  const cancelCommunityBtn = document.getElementById('cancelCommunityBtn');

  if (cancelCommunityBtn) {

    cancelCommunityBtn.addEventListener('click', () => hideModal('addCommunityModal'));

  }
  const cancelPersonnelBtn = document.getElementById('cancelPersonnelBtn');

  if (cancelPersonnelBtn) {

    cancelPersonnelBtn.addEventListener('click', () => hideModal('addPersonnelModal'));

  }

  const cancelChangeBtn = document.getElementById('cancelChangeBtn');

  if (cancelChangeBtn) {

    cancelChangeBtn.addEventListener('click', () => {

      clearChangeForm();

      hideModal('addChangeModal');

    });

  }

  // Event listeners para botones de confirmar
  // NOTA: Los listeners para confirmImageBtn, confirmChangeBtn y confirmFileBtn
  // están manejados por delegación de eventos en document.body (línea ~8040)
  // para evitar duplicación de eventos. No agregar listeners directos aquí.

  const confirmDescriptionBtn = document.getElementById('confirmDescriptionBtn');

  if (confirmDescriptionBtn) {
    
    // Remover listener previo si existe (para evitar duplicados)
    confirmDescriptionBtn.removeEventListener('click', updateProjectDescription);
    
    confirmDescriptionBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      updateProjectDescription();
    });

  } else {
  }

  // NOTA: confirmDataBtn ya está manejado por delegación de eventos en document.body
  // No se necesita listener directo para evitar doble ejecución
  
  /* DESHABILITADO - Ya manejado por delegación
  const confirmDataBtn = document.getElementById('confirmDataBtn');

  if (confirmDataBtn) {

    confirmDataBtn.addEventListener('click', saveProjectData);

  }
  */

  const confirmCommunityBtn = document.getElementById('confirmCommunityBtn');

  if (confirmCommunityBtn) {

    confirmCommunityBtn.addEventListener('click', addCommunityToProject);

  }

  const confirmPersonnelBtn = document.getElementById('confirmPersonnelBtn');

  if (confirmPersonnelBtn) {

    confirmPersonnelBtn.addEventListener('click', addPersonnelToProject);

  }

  // confirmChangeBtn está manejado por delegación de eventos en document.body

  const confirmFileDescriptionBtn = document.getElementById('confirmFileDescriptionBtn');

  if (confirmFileDescriptionBtn) {
    confirmFileDescriptionBtn.addEventListener('click', function(e) {
      updateProjectFileDescription();
    });

  } else {
  }

  const changeUseCurrentTimeCheckbox = document.getElementById('changeUseCurrentTime');

  if (changeUseCurrentTimeCheckbox) {

    changeUseCurrentTimeCheckbox.addEventListener('change', (event) => {
      toggleChangeUseCurrentTime(event.target.checked);
    });

  }

  // Event listener para el input de evidencias en el modal de cambios

  const changeEvidencesInput = document.getElementById('changeEvidencesInput');

  if (changeEvidencesInput) {
    changeEvidencesInput.addEventListener('change', handleChangeEvidencesSelect);

  } else {
  }

  // Event listeners para modal de archivos

  const closeFileModal = document.getElementById('closeFileModal');

  if (closeFileModal) {

    closeFileModal.addEventListener('click', () => hideModal('addFileModal'));

  }

  const closeFileDescriptionModal = document.getElementById('closeFileDescriptionModal');

  if (closeFileDescriptionModal) {

    closeFileDescriptionModal.addEventListener('click', () => {
      currentProjectFileEdit = null;
      hideModal('editFileDescriptionModal');
    });

  }

  const cancelFileBtn = document.getElementById('cancelFileBtn');

  if (cancelFileBtn) {

    cancelFileBtn.addEventListener('click', () => hideModal('addFileModal'));

  }

  const cancelFileDescriptionBtn = document.getElementById('cancelFileDescriptionBtn');

  if (cancelFileDescriptionBtn) {

    cancelFileDescriptionBtn.addEventListener('click', () => {
      currentProjectFileEdit = null;
      hideModal('editFileDescriptionModal');
    });

  }

  // confirmFileBtn está manejado por delegación de eventos en document.body

  // Input de archivo

  const fileInput = document.getElementById('fileInput');

  if (fileInput) {

    fileInput.addEventListener('change', handleFileSelect);

  }
  // Event listeners para modal de edición de valor de tarjeta

  const closeEditCardValueModal = document.getElementById('closeEditCardValueModal');

  if (closeEditCardValueModal) {

    closeEditCardValueModal.addEventListener('click', () => {

      editCardValueIndex = null;

      hideModal('editCardValueModal');

    });

  }

  const cancelEditCardValueBtn = document.getElementById('cancelEditCardValueBtn');

  if (cancelEditCardValueBtn) {

    cancelEditCardValueBtn.addEventListener('click', () => {

      editCardValueIndex = null;

      hideModal('editCardValueModal');

    });

  }

  const confirmEditCardValueBtn = document.getElementById('confirmEditCardValueBtn');

  if (confirmEditCardValueBtn) {

    confirmEditCardValueBtn.addEventListener('click', saveEditCardValue);

  }

  const editCardValueInput = document.getElementById('editCardValueInput');

  if (editCardValueInput) {

    editCardValueInput.addEventListener('keydown', (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        saveEditCardValue();

      }

    });

  }

  // Event listeners para modales de selección

  const closeCommunitySelectionModal = document.getElementById('closeCommunitySelectionModal');

  if (closeCommunitySelectionModal) {

    closeCommunitySelectionModal.addEventListener('click', () => hideModal('communitySelectionModal'));

  }

  const cancelCommunitySelectionBtn = document.getElementById('cancelCommunitySelectionBtn');

  if (cancelCommunitySelectionBtn) {

    cancelCommunitySelectionBtn.addEventListener('click', () => hideModal('communitySelectionModal'));

  }

  const confirmCommunitySelectionBtn = document.getElementById('confirmCommunitySelectionBtn');

  if (confirmCommunitySelectionBtn) {

    confirmCommunitySelectionBtn.addEventListener('click', async () => {

      const selectedIndices = getSelectedIndices('communitySelectionList');

      if (selectedIndices.length > 0) {

        const currentProject = getCurrentProject();

        if (currentProject) {

          // Eliminar comunidades seleccionadas (en orden inverso para mantener índices)

          selectedIndices.sort((a, b) => b - a).forEach(index => {

            currentProject.communities.splice(index, 1);

          });

          await loadProjectDetail(currentProject);

          showSuccessMessage(`${selectedIndices.length} comunidad(es) eliminada(s) exitosamente`);

          hideModal('communitySelectionModal');

        }

      } else {

        showErrorMessage('Por favor selecciona al menos una comunidad para eliminar');

      }

    });

  }

  const closeChangeSelectionModal = document.getElementById('closeChangeSelectionModal');

  if (closeChangeSelectionModal) {

    closeChangeSelectionModal.addEventListener('click', () => hideModal('changeSelectionModal'));

  }

  const cancelChangeSelectionBtn = document.getElementById('cancelChangeSelectionBtn');

  if (cancelChangeSelectionBtn) {

    cancelChangeSelectionBtn.addEventListener('click', () => hideModal('changeSelectionModal'));

  }

  const confirmChangeSelectionBtn = document.getElementById('confirmChangeSelectionBtn');

  if (confirmChangeSelectionBtn) {

    confirmChangeSelectionBtn.addEventListener('click', async () => {

      const selectedIndices = getSelectedIndices('changeSelectionList');

      if (selectedIndices.length > 0) {

        const currentProject = getCurrentProject();

        if (currentProject) {

          // Eliminar cambios seleccionados (en orden inverso para mantener índices)

          selectedIndices.sort((a, b) => b - a).forEach(index => {

            currentProject.changes.splice(index, 1);

          });

          await loadProjectDetail(currentProject);

          showSuccessMessage(`${selectedIndices.length} cambio(s) eliminado(s) exitosamente`);

          hideModal('changeSelectionModal');

        }

      } else {

        showErrorMessage('Por favor selecciona al menos un cambio para eliminar');

      }

    });

  }

  const closeFileSelectionModal = document.getElementById('closeFileSelectionModal');

  if (closeFileSelectionModal) {

    closeFileSelectionModal.addEventListener('click', () => hideModal('fileSelectionModal'));

  }

  const cancelFileSelectionBtn = document.getElementById('cancelFileSelectionBtn');

  if (cancelFileSelectionBtn) {

    cancelFileSelectionBtn.addEventListener('click', () => hideModal('fileSelectionModal'));

  }

  const confirmFileSelectionBtn = document.getElementById('confirmFileSelectionBtn');

  if (confirmFileSelectionBtn) {

    confirmFileSelectionBtn.addEventListener('click', async () => {

      const selectedIndices = getSelectedIndices('fileSelectionList');

      if (selectedIndices.length > 0) {

        const currentProject = getCurrentProject();

        if (currentProject) {

          // Eliminar archivos seleccionados (en orden inverso para mantener índices)

          selectedIndices.sort((a, b) => b - a).forEach(index => {

            currentProject.files.splice(index, 1);

          });

          await loadProjectDetail(currentProject);

          showSuccessMessage(`${selectedIndices.length} archivo(s) eliminado(s) exitosamente`);

          hideModal('fileSelectionModal');

        }

      } else {

        showErrorMessage('Por favor selecciona al menos un archivo para eliminar');

      }

    });

  }

  // Event listeners para modales de evidencias

  const closeChangeDetailsModal = document.getElementById('closeChangeDetailsModal');

  if (closeChangeDetailsModal) {

    closeChangeDetailsModal.addEventListener('click', () => hideModal('changeDetailsModal'));

  }

  const closeChangeDetailsBtn = document.getElementById('closeChangeDetailsBtn');

  if (closeChangeDetailsBtn) {

    closeChangeDetailsBtn.addEventListener('click', () => hideModal('changeDetailsModal'));

  }

  const addEvidenceBtn = document.getElementById('addEvidenceBtn');

  if (addEvidenceBtn) {

    addEvidenceBtn.addEventListener('click', showAddEvidenceModal);

  }

  const closeAddEvidenceModal = document.getElementById('closeAddEvidenceModal');

  if (closeAddEvidenceModal) {

    closeAddEvidenceModal.addEventListener('click', () => hideModal('addEvidenceModal'));

  }

  const cancelEvidenceBtn = document.getElementById('cancelEvidenceBtn');

  if (cancelEvidenceBtn) {

    cancelEvidenceBtn.addEventListener('click', () => hideModal('addEvidenceModal'));

  }

  const confirmEvidenceBtn = document.getElementById('confirmEvidenceBtn');

  if (confirmEvidenceBtn) {

    confirmEvidenceBtn.addEventListener('click', addEvidenceToChange);

  }

  const evidenceInput = document.getElementById('evidenceInput');

  if (evidenceInput) {

    evidenceInput.addEventListener('change', handleEvidenceSelect);

  }

  // Event listener para eliminar evidencias

  document.addEventListener('click', function(e) {

    if (e.target.closest('.evidence-remove')) {

      const button = e.target.closest('.evidence-remove');

      const evidenceIndex = parseInt(button.getAttribute('data-evidence-index'));

      removeEvidence(evidenceIndex);

    }

  });

  // Event listeners para modal de confirmación

  const closeConfirmModal = document.getElementById('closeConfirmModal');

  if (closeConfirmModal) {
    // Remover listeners anteriores para evitar duplicados
    closeConfirmModal.removeEventListener('click', cancelConfirmAction);
    // Usar fase de bubbling normal (no capture) para no interferir con otros handlers
    closeConfirmModal.addEventListener('click', (e) => {
      e.preventDefault();
      cancelConfirmAction(e);
    });
  }

  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

  if (cancelDeleteBtn) {
    // Remover listeners anteriores para evitar duplicados
    cancelDeleteBtn.removeEventListener('click', cancelConfirmAction);
    cancelDeleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cancelConfirmAction(e);
    });
  }

  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  if (confirmDeleteBtn) {
    // Remover listeners anteriores para evitar duplicados
    confirmDeleteBtn.removeEventListener('click', executeConfirmAction);
    // Usar la función unificada para confirmar acciones
    confirmDeleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeConfirmAction(e);
    });
    // Asegurar que el botón esté habilitado
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.style.pointerEvents = 'auto';
    confirmDeleteBtn.style.opacity = '1';
    confirmDeleteBtn.style.cursor = 'pointer';
  }
  
  // Mantener compatibilidad con showConfirmDeleteModal (para eliminar secciones)
  if (typeof window.showConfirmDeleteModal === 'undefined') {
    window.showConfirmDeleteModal = function(message, callback) {
      showConfirmModal(message, callback);
    };
  }
  
  if (typeof window.executeDeleteAction === 'undefined') {
    window.executeDeleteAction = executeConfirmAction;
  }

  // Event listeners para botones de eliminación de sección

  // El botón removeChangeBtn ha sido removido según solicitud del usuario

  const removeFileBtn = document.getElementById('removeFileBtn');

  if (removeFileBtn) {

    removeFileBtn.addEventListener('click', () => {

      const currentProject = getCurrentProject();

      if (currentProject && currentProject.files && currentProject.files.length > 0) {

        showCredentialsModal(() => {

          showFileSelectionModal(currentProject.files);

        });

      } else {

        showErrorMessage('No hay archivos para eliminar');

      }

    });

  }

  // Event listeners para botones de eliminación usando delegación de eventos

  document.addEventListener('click', function(e) {

    if (e.target.closest('.btn-remove-item')) {

      const button = e.target.closest('.btn-remove-item');

      if (button.hasAttribute('data-personnel-id')) {

        const personnelId = button.getAttribute('data-personnel-id');

        const personnelType = button.getAttribute('data-personnel-type') || 'colaborador';

        removePersonnelFromProject(personnelId, personnelType);

      } else if (button.hasAttribute('data-image-index')) {

        const imageIndex = parseInt(button.getAttribute('data-image-index'));

        removeImageFromProject(imageIndex);

      } else if (button.hasAttribute('data-community-index')) {

        const communityIndex = parseInt(button.getAttribute('data-community-index'));

        removeCommunityFromProject(communityIndex);

      } else if (button.hasAttribute('data-change-index')) {

        const changeIndex = parseInt(button.getAttribute('data-change-index'));

        removeChangeFromProject(changeIndex);

      } else if (button.hasAttribute('data-file-id')) {

        const fileId = button.getAttribute('data-file-id');

        removeFileFromProject(fileId);

      }

    }

  });

  // Cerrar modales al hacer clic fuera (en el backdrop del modal)
  document.addEventListener('click', function(e) {
    // Solo activar si el click cayó directamente sobre el overlay del modal (no en su contenido)
    if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
      const modalId = e.target.id;
      if (modalId) {
        // Usar hideModal para hacer limpieza completa (overflow, estado, etc.)
        hideModal(modalId);
      } else {
        // Fallback: remover clase active y verificar si quedan modales abiertos
        e.target.classList.remove('active');
        const remainingOpenModals = document.querySelectorAll('.modal.active').length;
        if (remainingOpenModals === 0) {
          document.body.style.overflow = '';
        }
      }
    }
  });

});

// ======= FUNCIONES PARA LISTAS DE SELECCIÓN =======

// Función para cargar lista de comunidades

async function loadAvailableCommunities(force = false) {

  if (availableCommunitiesLoaded && !force) return;

  try {

    const response = await fetch('/api/comunidades/', {

      credentials: 'include',

      headers: { 'Accept': 'application/json' }

    });

    if (!response.ok) throw new Error('Error al cargar comunidades');

    const data = await response.json();

    availableCommunities = (Array.isArray(data) ? data : []).map(c => ({

      id: String(c.id || ''),

      name: c.nombre || 'Sin nombre',

      region: c.region?.nombre || 'Sin región',

      region_id: c.region?.id ? String(c.region.id) : '',

      codigo: c.codigo || '',

      imagen_url: c.imagen_url || ''

    })).sort((a, b) => a.name.localeCompare(b.name));

    availableCommunitiesLoaded = true;

  } catch (error) {

    console.error('❌ Error cargando comunidades:', error);

    availableCommunities = [];

  }

}

async function loadCommunitiesList() {

  const communitiesList = document.getElementById('communitiesList');

  if (!communitiesList) return;

  communitiesList.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Cargando comunidades...</p>';

  await loadAvailableCommunities();

  // Inicializar selección desde el proyecto actual

  selectedCommunityIds = new Set();

  const currentProject = getCurrentProject();

  if (currentProject) {

    const projectCommunities = [

      ...(Array.isArray(currentProject.comunidades) ? currentProject.comunidades : []),

      ...(Array.isArray(currentProject.communities) ? currentProject.communities : [])

    ];

    projectCommunities.forEach(c => {

      const id = String(c.comunidad_id || c.id || '');

      if (id) selectedCommunityIds.add(id);

    });

  }

  renderCommunitiesList();

  renderSelectedCommunityChips();

  // Delegación de eventos (solo una vez)

  if (!communitiesList._communityDelegation) {

    communitiesList._communityDelegation = true;

    communitiesList.addEventListener('change', (e) => {

      const checkbox = e.target.closest('.community-item input[type="checkbox"]');

      if (!checkbox) return;

      const id = String(checkbox.value);

      if (checkbox.checked) selectedCommunityIds.add(id);

      else selectedCommunityIds.delete(id);

      renderCommunitiesList();

      renderSelectedCommunityChips();

    });

    communitiesList.addEventListener('click', (e) => {

      const item = e.target.closest('.community-item');

      if (!item || e.target.tagName === 'INPUT') return;

      const checkbox = item.querySelector('input[type="checkbox"]');

      if (checkbox) checkbox.click();

    });

  }

  const searchInput = document.getElementById('communitySearch');

  if (searchInput) {

    searchInput.value = '';

    if (!searchInput._communitySearchListener) {

      searchInput.addEventListener('input', filterCommunities);

      searchInput._communitySearchListener = true;

    }

  }

}

function renderCommunitiesList() {

  const communitiesList = document.getElementById('communitiesList');

  if (!communitiesList) return;

  communitiesList.innerHTML = '';

  const searchInput = document.getElementById('communitySearch');

  const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();

  const filtered = availableCommunities.filter(c =>

    c.name.toLowerCase().includes(searchTerm) ||

    c.region.toLowerCase().includes(searchTerm) ||

    c.codigo.toLowerCase().includes(searchTerm)

  );

  if (filtered.length === 0) {

    communitiesList.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">No se encontraron comunidades.</p>';

    return;

  }

  filtered.forEach(community => {

    const isSelected = selectedCommunityIds.has(community.id);

    const item = document.createElement('div');

    item.className = 'community-item' + (isSelected ? ' selected' : '');

    item.dataset.communityId = community.id;

    item.innerHTML = `

      <input type="checkbox" id="community-${community.id}" value="${community.id}" ${isSelected ? 'checked' : ''}>

      <div class="community-info">

        <div class="community-name">${escapeHtml(community.name)}</div>

        <div class="community-region">${escapeHtml(community.region)}${community.codigo ? ` · ${escapeHtml(community.codigo)}` : ''}</div>

      </div>

    `;

    communitiesList.appendChild(item);

  });

}

function renderSelectedCommunityChips() {

  const container = document.getElementById('selectedCommunitiesChips');

  if (!container) return;

  container.innerHTML = '';

  if (selectedCommunityIds.size === 0) {

    container.innerHTML = '<p class="selected-communities-empty">No hay comunidades seleccionadas.</p>';

    return;

  }

  selectedCommunityIds.forEach(id => {

    const community = availableCommunities.find(c => c.id === id);

    if (!community) return;

    const chip = document.createElement('div');

    chip.className = 'community-chip';

    chip.innerHTML = `

      <span>${escapeHtml(community.name)}</span>

      <button type="button" data-community-id="${community.id}" title="Quitar comunidad">

        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">

          <line x1="18" y1="6" x2="6" y2="18"></line>

          <line x1="6" y1="6" x2="18" y2="18"></line>

        </svg>

      </button>

    `;

    chip.querySelector('button').addEventListener('click', (e) => {

      e.stopPropagation();

      selectedCommunityIds.delete(id);

      renderCommunitiesList();

      renderSelectedCommunityChips();

    });

    container.appendChild(chip);

  });

}

// Función para cargar lista de personal

function loadPersonnelList() {

  const personnelList = document.getElementById('personnelList');

  if (!personnelList) return;

  personnelList.innerHTML = '';

  availablePersonnel.forEach(person => {

    const personnelItem = document.createElement('div');

    personnelItem.className = 'personnel-item';

    personnelItem.innerHTML = `

      <input type="checkbox" id="personnel-${person.id}" value="${person.id}">

      <div class="personnel-info">

        <div class="personnel-name">${person.name}</div>

        <div class="personnel-role">${person.role}</div>

      </div>

    `;

    personnelList.appendChild(personnelItem);

  });

}

// Función para obtener comunidades seleccionadas

function getSelectedCommunities() {

  return Array.from(selectedCommunityIds)

    .map(id => availableCommunities.find(c => c.id === id))

    .filter(Boolean);

}

// Función para obtener personal seleccionado

function getSelectedPersonnel() {

  const checkboxes = document.querySelectorAll('.personnel-checkbox:checked:not(:disabled)');

  const selected = [];

  checkboxes.forEach(checkbox => {

    const item = checkbox.closest('.personnel-item');

    if (!item) return;

    const id = checkbox.getAttribute('data-personnel-id');

    const tipo = item.getAttribute('data-personnel-type');

    const nombreElement = item.querySelector('h4');

    const puestoElement = item.querySelector('p');

    if (id && nombreElement) {

      selected.push({

        id: id,

        tipo: tipo || 'colaborador',

        nombre: nombreElement.textContent.trim(),

        puesto: puestoElement ? puestoElement.textContent.trim() : ''

      });

    }

  });

  return selected;

}

// Función para filtrar comunidades

function filterCommunities() {

  renderCommunitiesList();

}
// Función para cargar lista de personal en modal de cambios (solo colaboradores asignados al proyecto)

async function loadChangePersonnelList() {

  const personnelList = document.getElementById('changePersonnelList');

  if (!personnelList) {
    return;
  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    personnelList.innerHTML = '<p style="color: #6c757d;">No se pudo obtener la información del proyecto.</p>';

    return;

  }

  // Obtener solo los colaboradores asignados al proyecto actual

  const personalAsignado = currentProject.personal || [];

  personnelList.innerHTML = '';

  if (personalAsignado.length === 0) {

    personnelList.innerHTML = '<p style="color: #6c757d;">No hay colaboradores asignados a este proyecto.</p>';

    return;

  }

  // Renderizar solo colaboradores (no usuarios directos) con checkboxes como en "Personal a Cargo"
  let colaboradoresCount = 0;
  
  personalAsignado.forEach(person => {

    if (person.tipo === 'colaborador' && person.id) {
      colaboradoresCount++;

      const personnelItem = document.createElement('div');

      personnelItem.className = 'personnel-item';

      personnelItem.style.cssText = 'display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: pointer; border: 2px solid transparent;';

      personnelItem.setAttribute('data-personnel-id', person.id);

      personnelItem.innerHTML = `

        <input type="checkbox" class="change-personnel-checkbox" id="change-personnel-${person.id}" value="${person.id}" style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">

        <div style="flex: 1;">

          <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1rem;">${person.nombre || 'Sin nombre'}</h4>

          <p style="margin: 2px 0; color: #007bff; font-size: 0.9rem;">${person.puesto || person.rol_display || 'Sin puesto'}</p>

          <p style="margin: 2px 0; color: #b8c5d1; font-size: 0.85rem;">${person.rol_display || 'Colaborador'}</p>

        </div>

      `;

      personnelList.appendChild(personnelItem);

      // Agregar event listener para cambiar estilo cuando se selecciona

      const checkbox = personnelItem.querySelector('.change-personnel-checkbox');

      checkbox.addEventListener('change', function() {

        if (this.checked) {

          personnelItem.style.borderColor = '#007bff';

          personnelItem.style.background = 'rgba(0, 123, 255, 0.1)';

        } else {

          personnelItem.style.borderColor = 'transparent';

          personnelItem.style.background = 'rgba(255, 255, 255, 0.05)';

        }

      });

    }

  });

  // Agregar event listener para el buscador

  const searchInput = document.getElementById('changePersonnelSearch');

  if (searchInput) {

    searchInput.addEventListener('input', filterChangePersonnel);

  }

}

// Función para cargar comunidades del proyecto en el formulario de cambios
async function loadChangeCommunitiesList() {
  
  const communitiesList = document.getElementById('changeCommunitiesList');

  if (!communitiesList) {
    return;
  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {
    communitiesList.innerHTML = '<p style="color: #6c757d;">No se pudo obtener la información del proyecto.</p>';
    return;
  }

  // Obtener las comunidades relacionadas con el proyecto
  const rawCommunities = currentProject.comunidades || currentProject.communities || [];
  
  // Normalizar las comunidades para asegurar que tengan los campos correctos
  const comunidadesProyecto = normalizeCommunitiesData(rawCommunities);

  communitiesList.innerHTML = '';

  if (comunidadesProyecto.length === 0) {
    communitiesList.innerHTML = '<p style="color: #6c757d;">No hay comunidades relacionadas con este proyecto.</p>';
    return;
  }

  // Renderizar comunidades con checkboxes
  comunidadesProyecto.forEach(comunidad => {
    const communityItem = document.createElement('div');
    communityItem.className = 'community-item';
    communityItem.style.cssText = 'display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: pointer; border: 2px solid transparent;';

    // Obtener el ID de la comunidad de múltiples fuentes posibles
    // IMPORTANTE: Verificar todos los campos posibles donde puede estar el ID
    let comunidadId = null;
    
    // Intentar obtener el ID de diferentes campos
    if (comunidad.id) {
      comunidadId = String(comunidad.id).trim();
    } else if (comunidad.comunidad_id) {
      comunidadId = String(comunidad.comunidad_id).trim();
    } else if (comunidad.community_id) {
      comunidadId = String(comunidad.community_id).trim();
    } else if (comunidad.pk) {
      comunidadId = String(comunidad.pk).trim();
    } else if (comunidad.uuid) {
      comunidadId = String(comunidad.uuid).trim();
    }
    
    if (!comunidadId || comunidadId === '' || comunidadId === 'undefined' || comunidadId === 'null') {
      return; // Saltar esta comunidad si no tiene ID
    }
    
    // Usar el campo 'name' que viene de normalizeCommunitiesData
    const comunidadNombre = comunidad.name || comunidad.nombre || 'Sin nombre';
    // Usar el campo 'region' que viene de normalizeCommunitiesData (ya incluye región y sede)
    const regionNombre = comunidad.region || comunidad.region_nombre || 'Sin región';

    communityItem.setAttribute('data-community-id', comunidadId);

    // Asegurarse de que el valor del checkbox sea el ID correcto
    const checkboxId = `change-community-${comunidadId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    const checkboxValue = comunidadId; // El valor debe ser el ID de la comunidad
    
    communityItem.innerHTML = `
      <input type="checkbox" class="change-community-checkbox" id="${escapeHtml(checkboxId)}" value="${escapeHtml(checkboxValue)}" style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">
      <div style="flex: 1;">
        <h4 style="margin: 0 0 4px 0; color: #ffffff; font-size: 1rem;">${escapeHtml(comunidadNombre)}</h4>
        <p style="margin: 2px 0; color: #b8c5d1; font-size: 0.85rem;">${escapeHtml(regionNombre)}</p>
      </div>
    `;
    
    // Verificar que el checkbox se creó correctamente
    const createdCheckbox = communityItem.querySelector('.change-community-checkbox');
    if (createdCheckbox) {
    } else {
    }

    communitiesList.appendChild(communityItem);

    // Agregar event listener para cambiar estilo cuando se selecciona
    const checkbox = communityItem.querySelector('.change-community-checkbox');
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        communityItem.style.borderColor = '#007bff';
        communityItem.style.background = 'rgba(0, 123, 255, 0.1)';
      } else {
        communityItem.style.borderColor = 'transparent';
        communityItem.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });

    // Permitir clic en el item para seleccionar/deseleccionar
    communityItem.addEventListener('click', function(e) {
      if (e.target !== checkbox && e.target !== checkbox.parentElement) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  });

  // Agregar event listener para el buscador de comunidades
  const searchInput = document.getElementById('changeCommunitiesSearch');
  if (searchInput) {
    searchInput.addEventListener('input', filterChangeCommunities);
  }
}

// Función para filtrar comunidades en el formulario de cambios
function filterChangeCommunities() {
  const searchTerm = document.getElementById('changeCommunitiesSearch').value.toLowerCase().trim();
  const communityItems = document.querySelectorAll('#changeCommunitiesList .community-item');

  communityItems.forEach(item => {
    const communityName = item.querySelector('h4')?.textContent.toLowerCase() || '';
    const regionName = item.querySelector('p')?.textContent.toLowerCase() || '';
    const matches = communityName.includes(searchTerm) || regionName.includes(searchTerm);
    item.style.display = matches ? 'flex' : 'none';
  });
}

// Función para obtener comunidades seleccionadas en modal de cambios
function getSelectedChangeCommunities() {
  const checkboxes = document.querySelectorAll('#changeCommunitiesList input.change-community-checkbox:checked');

  const selected = [];

  checkboxes.forEach((cb, index) => {
    const communityItem = cb.closest('.community-item');
    if (communityItem) {
      const communityId = cb.value ? String(cb.value).trim() : '';
      const dataCommunityId = communityItem.getAttribute('data-community-id') ? String(communityItem.getAttribute('data-community-id')).trim() : '';
      const name = communityItem.querySelector('h4')?.textContent.trim() || '';
      
      // Usar el ID del checkbox o el data-attribute como respaldo
      let finalId = communityId || dataCommunityId || '';
      
      // Validar que el ID no sea vacío, null, undefined, o string "null"/"undefined"
      if (!finalId || finalId === '' || finalId === 'null' || finalId === 'undefined' || finalId === 'NaN') {
        return; // Saltar esta comunidad
      }

      selected.push({
        id: finalId,
        name: name
      });
    } else {
    }
  });

  return selected;
}

// Función para obtener personal seleccionado en modal de cambios (múltiples)

function getSelectedChangePersonnel() {

  const checkboxes = document.querySelectorAll('#changePersonnelList input.change-personnel-checkbox:checked');

  const selected = [];

  checkboxes.forEach(cb => {

    const personItem = cb.closest('.personnel-item');

    if (personItem) {

      const personId = cb.value;
      const name = personItem.querySelector('h4')?.textContent.trim() || '';

      selected.push({

        id: personId,

        name: name

      });

    }

  });

  return selected;

}
// Función para filtrar personal en modal de cambios

function filterChangePersonnel() {

  const searchTerm = document.getElementById('changePersonnelSearch').value.toLowerCase();

  const personnelItems = document.querySelectorAll('#changePersonnelList .personnel-item');

  personnelItems.forEach(item => {

    const name = item.querySelector('h4')?.textContent.toLowerCase() || '';

    const roleP = item.querySelector('p')?.textContent.toLowerCase() || '';

    const roleP2 = item.querySelectorAll('p')[1]?.textContent.toLowerCase() || '';

    if (name.includes(searchTerm) || roleP.includes(searchTerm) || roleP2.includes(searchTerm)) {

      item.style.display = 'flex';

    } else {

      item.style.display = 'none';

    }

  });

}

// También manejar el caso cuando la página se carga directamente con hash

window.addEventListener('load', function() {

  handleUrlAnchor();

});

// Re-agregar event listeners cuando se muestre la vista principal

const originalShowMainView = showMainView;

showMainView = function() {

  originalShowMainView();

  setTimeout(addViewMoreListeners, 100); // Pequeño delay para asegurar que los elementos estén disponibles

};

// ======= FUNCIÓN PARA GUARDAR DATOS DEL PROYECTO =======

async function saveProjectData() {
  // Control de concurrencia: evitar múltiples guardados simultáneos
  if (isSavingProjectData) {
    console.log('⚠️ saveProjectData ya está en ejecución - Ignorando llamada duplicada');
    return;
  }
  
  console.log('💾 saveProjectData iniciando...');
  isSavingProjectData = true;

  try {

    if (!tienePermisoGestionActual()) {

      mostrarMensajePermisoDenegado();
      isSavingProjectData = false;
      return;

    }

    // Obtener el proyecto actual

    let proyecto = getCurrentProject();

  if (!proyecto || !proyecto.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');
    isSavingProjectData = false;
    return;

  }

  // Validar que todas las tarjetas tengan título y valor

  const invalidCards = selectedCards.filter(card => !card.label.trim() || !card.value.trim());

  if (invalidCards.length > 0) {

    showErrorMessage('Por favor completa el título y valor de todas las tarjetas');
    isSavingProjectData = false;
    return;

  }

  try {

    // Obtener tarjetas originales del proyecto

    const tarjetasOriginales = (proyecto.tarjetas_datos || []).map(t => t.id);

    // Crear un mapa de tarjetas por título para detectar duplicados

    const tarjetasPorTitulo = {};

    (proyecto.tarjetas_datos || []).forEach(t => {

      tarjetasPorTitulo[t.titulo.toLowerCase().trim()] = t.id;

    });

    // Separar tarjetas nuevas, actualizadas y eliminadas

    const tarjetasNuevas = [];

    const tarjetasActualizadas = [];

    const tarjetasTitulosNuevas = new Set(); // Para evitar duplicados en nuevas

    selectedCards.forEach(card => {

      const cardId = card.id || '';

      const cardLabelNormalized = card.label.trim().toLowerCase();

      // Si el ID es undefined, null, vacío o empieza con 'card_', es una tarjeta nueva

      if (!cardId || (typeof cardId === 'string' && cardId.startsWith('card_'))) {

        // Verificar si ya existe una tarjeta con el mismo título en la BD

        if (tarjetasPorTitulo[cardLabelNormalized]) {

          // Actualizar la tarjeta existente en lugar de crear una nueva

          tarjetasActualizadas.push({

            id: tarjetasPorTitulo[cardLabelNormalized],

            titulo: card.label.trim(),

            valor: card.value.trim(),

            icono: card.icon || '📊'

          });

        } else if (!tarjetasTitulosNuevas.has(cardLabelNormalized)) {

          // Solo agregar si no está duplicada en las nuevas

          tarjetasNuevas.push({

            titulo: card.label.trim(),

            valor: card.value.trim(),

            icono: card.icon || '📊'

          });

          tarjetasTitulosNuevas.add(cardLabelNormalized);

        } else {

        }

      } else if (tarjetasOriginales.includes(cardId)) {

        // Si el ID existe en las tarjetas originales, es una actualización

        tarjetasActualizadas.push({

          id: cardId,

          titulo: card.label.trim(),

          valor: card.value.trim(),

          icono: card.icon || '📊'

        });

      } else {

        // Si el ID no está en las originales pero tampoco es nuevo, verificar por título

        if (tarjetasPorTitulo[cardLabelNormalized]) {

          tarjetasActualizadas.push({

            id: tarjetasPorTitulo[cardLabelNormalized],

            titulo: card.label.trim(),

            valor: card.value.trim(),

            icono: card.icon || '📊'

          });

        } else if (!tarjetasTitulosNuevas.has(cardLabelNormalized)) {

          tarjetasNuevas.push({

            titulo: card.label.trim(),

            valor: card.value.trim(),

            icono: card.icon || '📊'

          });

          tarjetasTitulosNuevas.add(cardLabelNormalized);

        }

      }

    });

    // Las tarjetas eliminadas son las que están en originales pero no en las actuales

    const tarjetasActualesIds = selectedCards

      .filter(c => c.id && typeof c.id === 'string' && !c.id.startsWith('card_'))

      .map(c => c.id);

    const tarjetasEliminadas = tarjetasOriginales.filter(id => !tarjetasActualesIds.includes(id));

    // DEBUG: Mostrar lo que se va a enviar
    console.log('🔍 DATOS A ENVIAR AL BACKEND:');
    console.log('📊 Tarjetas Nuevas:', tarjetasNuevas);
    console.log('✏️ Tarjetas Actualizadas:', tarjetasActualizadas);
    console.log('🗑️ Tarjetas Eliminadas:', tarjetasEliminadas);
    console.log('📋 Tarjetas Originales (IDs):', tarjetasOriginales);
    console.log('📝 Tarjetas por Título:', tarjetasPorTitulo);
    console.log('🎯 selectedCards:', selectedCards);

    // Preparar datos para enviar a la API

    const formData = new FormData();

    if (tarjetasNuevas.length > 0) {

      formData.append('tarjetas_datos_nuevas', JSON.stringify(tarjetasNuevas));

    }

    if (tarjetasActualizadas.length > 0) {

      formData.append('tarjetas_datos_actualizadas', JSON.stringify(tarjetasActualizadas));

    }

    if (tarjetasEliminadas.length > 0) {

      formData.append('tarjetas_datos_eliminadas', JSON.stringify(tarjetasEliminadas));

    }

    // Si no hay cambios, solo cerrar el modal

    if (tarjetasNuevas.length === 0 && tarjetasActualizadas.length === 0 && tarjetasEliminadas.length === 0) {

      hideModal('editDataModal');
      isSavingProjectData = false;
      return;

    }

    // Enviar a la API

    const response = await fetch(`/api/evento/${proyecto.id}/actualizar/`, {

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    // Verificar si la respuesta es JSON válido

    const contentType = response.headers.get('content-type');

    let result;

    if (!contentType || !contentType.includes('application/json')) {

      const text = await response.text();

      showErrorMessage('Error del servidor. Por favor, intenta de nuevo.');
      isSavingProjectData = false;
      return;

    }

    // Parsear JSON

    try {

      result = await response.json();

    } catch (jsonError) {

      showErrorMessage('Error al procesar la respuesta del servidor. Por favor, intenta de nuevo.');
      isSavingProjectData = false;
      return;

    }

    if (!response.ok) {

      showErrorMessage(result.error || `Error ${response.status}: ${response.statusText}`);
      isSavingProjectData = false;
      return;

    }

    if (result.success) {
      
      // DEBUG: Mostrar respuesta del backend
      console.log('✅ RESPUESTA DEL BACKEND:', result);

      hideModal('editDataModal');

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Datos del proyecto actualizados exitosamente.');

      // Limpiar variables

      selectedCards = [];

      currentEditProject = null;

    } else {

      showErrorMessage(result.error || 'Error al actualizar los datos del proyecto.');

    }

  } catch (error) {

    showErrorMessage('Error al guardar los datos. Por favor, intenta de nuevo.');

  } finally {
    // Siempre liberar el lock al finalizar
    isSavingProjectData = false;
    console.log('✅ saveProjectData finalizado - Lock liberado');
  }

  } catch (outerError) {
    // Capturar errores del bloque externo
    console.error('Error inesperado en saveProjectData:', outerError);
    showErrorMessage('Error inesperado. Por favor, intenta de nuevo.');
    isSavingProjectData = false;
  }

}

// ======= FUNCIONES PARA MANEJO DE ARCHIVOS =======

// Variable para almacenar archivos seleccionados

let selectedProjectFiles = [];

function showAddFileModal() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  showModal('addFileModal');

  clearFileForm();

}

function clearFileForm() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.value = '';
  }

  // Ya no hay textarea general de descripción, solo por archivo
  // const fileDescription = document.getElementById('fileDescription');
  // if (fileDescription) {
  //   fileDescription.value = '';
  // }

  selectedProjectFiles = [];

  const filePreview = document.getElementById('filePreview');
  if (filePreview) {
    filePreview.innerHTML = '';
  }
  
}

function handleFileSelect(event) {

  const files = event.target.files;

  if (!files || files.length === 0) {
    return;
  }

  // Agregar todos los archivos seleccionados al array
  Array.from(files).forEach(file => {
    const fileObj = {
      file: file,
      id: Date.now() + Math.random(),
      description: '' // Descripción vacía por defecto
    };
    selectedProjectFiles.push(fileObj);
  });

  // Limpiar el input para permitir seleccionar más archivos
  event.target.value = '';

  // Renderizar el preview de archivos
  renderFilePreview();
}

function renderFilePreview() {

  const preview = document.getElementById('filePreview');

  if (!preview) {
    return;
  }

  preview.innerHTML = '';

  if (selectedProjectFiles.length === 0) {
    return;

  }

  selectedProjectFiles.forEach((fileItem) => {
    // Contenedor principal del archivo
    const fileCard = document.createElement('div');
    fileCard.className = 'file-preview-card';
    fileCard.style.cssText = 'background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; margin-bottom: 12px; width: 100%;';
    fileCard.setAttribute('data-file-id', fileItem.id);

    // Fila superior: icono, nombre, tamaño y botón eliminar
    const fileHeader = document.createElement('div');
    fileHeader.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 8px;';

    // Icono del archivo
    const fileIcon = document.createElement('div');
    fileIcon.className = 'file-preview-icon';
    fileIcon.style.cssText = 'width: 48px; height: 48px; flex-shrink: 0; background: rgba(0, 123, 255, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.75rem; color: #fff;';
    fileIcon.textContent = getFileExtension(fileItem.file.name).toUpperCase();

    // Información del archivo (nombre y tamaño)
    const fileInfo = document.createElement('div');
    fileInfo.style.cssText = 'flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;';

    const fileName = document.createElement('div');
    fileName.className = 'file-preview-name';
    fileName.style.cssText = 'color: #fff; font-weight: 500; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    fileName.textContent = fileItem.file.name;

    const fileSize = document.createElement('div');
    fileSize.className = 'file-preview-size';
    fileSize.style.cssText = 'color: #6c757d; font-size: 0.85rem;';
    fileSize.textContent = formatFileSize(fileItem.file.size);

    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);

    // Botón eliminar
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-file-btn';
    removeBtn.setAttribute('data-file-id', fileItem.id);
    removeBtn.style.cssText = 'background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; transition: background 0.2s;';
    removeBtn.title = 'Eliminar archivo';
    removeBtn.onmouseover = function() { this.style.background = '#dc3545'; };
    removeBtn.onmouseout = function() { this.style.background = 'rgba(220, 53, 69, 0.9)'; };
    removeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    // Event listener para eliminar archivo
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const fileId = this.getAttribute('data-file-id');
      removeProjectFile(fileId);
    });

    fileHeader.appendChild(fileIcon);
    fileHeader.appendChild(fileInfo);
    fileHeader.appendChild(removeBtn);

    // Campo de descripción individual
    const descriptionContainer = document.createElement('div');
    descriptionContainer.style.cssText = 'margin-top: 8px;';

    const descriptionTextarea = document.createElement('textarea');
    descriptionTextarea.className = 'form-textarea file-description-input';
    descriptionTextarea.setAttribute('data-file-id', fileItem.id);
    descriptionTextarea.placeholder = 'Descripción del archivo (opcional)...';
    descriptionTextarea.rows = 1;
    descriptionTextarea.value = fileItem.description || '';
    descriptionTextarea.style.cssText = 'width: 100%; background: rgba(30, 41, 59, 0.85); color: rgba(255, 255, 255, 0.95); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; padding: 6px 8px; font-size: 0.85rem; resize: vertical; min-height: 32px;';

    // Actualizar descripción al escribir
    descriptionTextarea.addEventListener('input', function(e) {
      const fileId = this.getAttribute('data-file-id');
      const fileObj = selectedProjectFiles.find(f => f.id == fileId);
      if (fileObj) {
        fileObj.description = this.value;
      }
    });

    descriptionContainer.appendChild(descriptionTextarea);

    fileCard.appendChild(fileHeader);
    fileCard.appendChild(descriptionContainer);
    preview.appendChild(fileCard);
  });

}
function removeProjectFile(fileId) {

  selectedProjectFiles = selectedProjectFiles.filter(item => item.id !== parseFloat(fileId));

  renderFilePreview();

}

function getFileExtension(filename) {

  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);

}

function formatFileSize(bytes) {

  if (bytes === 0) return '0 Bytes';

  const k = 1024;

  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];

}

async function addFileToProject() {
  
  // Prevenir ejecuciones múltiples
  if (isUploadingFile) {
    return;
  }

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();
    return;
  }

  // Marcar como en proceso
  isUploadingFile = true;
  
  // Deshabilitar botón inmediatamente
  const confirmButton = document.getElementById('confirmFileBtn');
  const originalLabel = confirmButton ? confirmButton.textContent : null;
  
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Guardando...';
  }

  // Ya no hay textarea general de descripción, cada archivo tiene la suya

  if (selectedProjectFiles.length === 0) {
    isUploadingFile = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    showErrorMessage('Por favor selecciona al menos un archivo');
    return;
  }

  // Obtener el proyecto actual
  let proyecto = getCurrentProject();

  if (!proyecto || !proyecto.id) {
    isUploadingFile = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    showErrorMessage('Error: No se pudo obtener la información del evento.');
    return;
  }

  const isOffline = !navigator.onLine;
  const db = getOfflineDB();

  if (isOffline && db) {
    // Modo offline: guardar archivos en IndexedDB
    try {
      if (!proyecto.archivos) {
        proyecto.archivos = [];
      }

      // Convertir archivos a base64 y agregarlos al proyecto
      for (let i = 0; i < selectedProjectFiles.length; i++) {
        const fileItem = selectedProjectFiles[i];
        const file = fileItem.file;
        const description = fileItem.description || '';

        try {
          const base64 = await fileToBase64(file);
          const extension = file.name.split('.').pop()?.toLowerCase() || '';
          const esImagen = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension);

          const nuevoArchivo = {
            id: `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            nombre: file.name,
            descripcion: description,
            tamanio: file.size,
            tipo: file.type,
            extension: extension,
            es_imagen: esImagen,
            base64: base64,
            es_offline: true,
            creado_en: new Date().toISOString(),
            modificado_offline: true
          };

          proyecto.archivos.push(nuevoArchivo);
        } catch (error) {
          console.warn(`Error al convertir archivo ${file.name} a base64:`, error);
          showErrorMessage(`Error al procesar el archivo ${file.name}. Por favor, intenta con otro archivo.`);
        }
      }

      proyecto.modificado_offline = true;
      proyecto.ultimo_sync = new Date().toISOString();

      await db.saveProyecto(proyecto);

      // Actualizar vista inmediatamente
      currentProjectData = proyecto;
      await mostrarDetalleProyecto(proyecto);

      // Limpiar formulario
      hideModal('addFileModal');
      clearFileForm();

      showSuccessMessage(`${selectedProjectFiles.length} archivo(s) guardado(s) sin conexión. Se enviarán automáticamente cuando vuelva el internet.`);

      // Intentar agregar a la cola de sincronización
      // Convertir archivos a base64 para poder serializarlos
      const csrfToken = getCookie('csrftoken');
      if (window.OfflineSync && window.OfflineSync.enqueueManual && csrfToken) {
        for (let i = 0; i < selectedProjectFiles.length; i++) {
          const fileItem = selectedProjectFiles[i];
          const file = fileItem.file;
          const description = fileItem.description || '';

          try {
            // Convertir archivo a base64 para poder serializarlo
            const base64 = await fileToBase64(file);
            
            // Guardar en la cola usando enqueueManual que procesa el body correctamente
            window.OfflineSync.enqueueManual(`/api/evento/${proyecto.id}/archivo/agregar/`, {
              method: 'POST',
              headers: {
                'X-CSRFToken': csrfToken
              },
              body: {
                type: 'formdata',
                files: [{
                  key: 'archivo',
                  fileName: file.name,
                  fileType: file.type,
                  base64: base64
                }],
                fields: description ? [{ key: 'descripcion', value: description }] : []
              }
            });
            console.log(`✅ Archivo ${file.name} agregado a la cola de sincronización`);
          } catch (error) {
            console.error(`❌ Error al agregar archivo ${file.name} a la cola:`, error);
          }
        }
        // Actualizar el estado de sincronización
        if (window.OfflineSync.updateSyncStatus) {
          window.OfflineSync.updateSyncStatus();
        }
      } else {
        console.warn('⚠️ OfflineSync no está disponible o no hay CSRF token');
      }

      isUploadingFile = false;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalLabel || 'Agregar';
      }

      return;
    } catch (error) {
      console.error('Error al guardar archivos offline:', error);
      showErrorMessage('Error al guardar los archivos offline. Por favor, intenta de nuevo.');
      isUploadingFile = false;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalLabel || 'Agregar';
      }
      return;
    }
  }

  try {
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Enviar cada archivo con su descripción individual
    for (let i = 0; i < selectedProjectFiles.length; i++) {
      const fileItem = selectedProjectFiles[i];
      const file = fileItem.file;
      const description = fileItem.description || '';

      try {
        // Crear FormData para enviar el archivo
        const formData = new FormData();
        formData.append('archivo', file);
        if (description) {
          formData.append('descripcion', description);
        }

        // Llamar a la API
        const url = `/api/evento/${proyecto.id}/archivo/agregar/`;
        
        const response = await fetch(url, {
          credentials: 'include',
          method: 'POST',
          headers: {
            'X-CSRFToken': getCookie('csrftoken')
          },
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${file.name}: ${result.error || 'Error desconocido'}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    // Mostrar resultados

    if (successCount > 0) {
      hideModal('addFileModal');
      
      clearFileForm();

      // Actualizar la vista en tiempo real
      const mensaje = errorCount === 0 
        ? `${successCount} archivo(s) agregado(s) exitosamente.`
        : `${successCount} archivo(s) agregado(s). ${errorCount} archivo(s) fallaron.`;
      await refreshCurrentProject(mensaje);
    } else {
      // Todos fallaron
      showErrorMessage(`Error al agregar archivos: ${errors.join(', ')}`);
    }

  } catch (error) {
    showErrorMessage('Error al agregar archivo. Por favor, intenta de nuevo.');
  } finally {
    // Liberar el flag
    isUploadingFile = false;
    
    // Restaurar botón
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Agregar';
    }
    
  }
}
// Función para eliminar archivo del proyecto

async function eliminarArchivoProyecto(archivoId) {

  // Obtener el proyecto actual

  let proyecto = getCurrentProject();

  if (!proyecto || !proyecto.id) {
    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  try {

    // Cerrar el modal de edición de descripción si está abierto para el archivo que se está eliminando
    if (currentProjectFileEdit && currentProjectFileEdit.id === archivoId) {
      hideModal('editFileDescriptionModal');
      currentProjectFileEdit = null;
      // Esperar un momento para que el modal se cierre completamente antes de continuar
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Llamar a la API para eliminar

    const response = await fetch(`/api/evento/${proyecto.id}/archivo/${archivoId}/eliminar/`, {

      method: 'DELETE',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    const result = await response.json();

    if (result.success) {

      // Actualizar la vista en tiempo real
      // Usar un pequeño delay para asegurar que el backend haya procesado completamente la eliminación
      await new Promise(resolve => setTimeout(resolve, 200));
      await refreshCurrentProject('Archivo eliminado exitosamente.');

    } else {

      showErrorMessage(result.error || 'Error al eliminar archivo.');

    }

  } catch (error) {

    showErrorMessage('Error al eliminar archivo. Por favor, intenta de nuevo.');

  }

}

function showEditProjectFileDescriptionModal(fileId, description) {
  
  if (!tienePermisoGestionActual()) {
    showErrorMessage('No tienes permisos para editar archivos.');
    return;
  }

  const textarea = document.getElementById('editFileDescriptionInput');
  
  if (!textarea) {
    return;
  }

  // Asegurar que el textarea no esté deshabilitado
  textarea.disabled = false;
  textarea.readOnly = false;

  currentProjectFileEdit = {
    id: fileId,
    originalDescription: description || '',
  };

  textarea.value = description || '';
  
  showModal('editFileDescriptionModal');
  
  // Enfocar el textarea después de un pequeño delay para asegurar que el modal está visible
  setTimeout(() => {
    textarea.focus();
  }, 100);
  
}

async function updateProjectFileDescription() {
  
  if (!tienePermisoGestionActual()) {
    showErrorMessage('No tienes permisos para editar archivos.');
    return;
  }

  const proyectoId = currentProjectId || (currentProjectData && currentProjectData.id);
  
  if (!proyectoId || !currentProjectFileEdit || !currentProjectFileEdit.id) {
    showErrorMessage('No se pudo identificar el archivo a editar.');
    return;
  }

  const textarea = document.getElementById('editFileDescriptionInput');
  
  if (!textarea) {
    return;
  }

  const newDescription = textarea.value.trim();
  
  const confirmButton = document.getElementById('confirmFileDescriptionBtn');
  const originalLabel = confirmButton ? confirmButton.textContent : null;

  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Guardando...';
  }

  try {
    const response = await fetch(`/api/evento/${proyectoId}/archivo/${currentProjectFileEdit.id}/actualizar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || '',
      },
      body: JSON.stringify({ descripcion: newDescription }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'No se pudo actualizar la descripción');
    }

    hideModal('editFileDescriptionModal');
    currentProjectFileEdit = null;
    
    // Actualizar la vista en tiempo real
    await refreshCurrentProject('Descripción del archivo actualizada exitosamente.');
  } catch (error) {
    showErrorMessage(error.message || 'Error al actualizar la descripción del archivo.');
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalLabel || 'Guardar cambios';
    }
  }
}

// Función obsoleta - mantener para compatibilidad pero no usar

async function addFileToProjectOld() {

  const fileInput = document.getElementById('fileInput');

  const fileName = document.getElementById('fileName').value.trim();

  const fileDescription = document.getElementById('fileDescription').value.trim();

  if (!fileInput.files[0]) {

    showErrorMessage('Por favor selecciona un archivo');

    return;

  }

  if (!fileName) {

    showErrorMessage('Por favor ingresa un nombre para el archivo');

    return;

  }

  const file = fileInput.files[0];

  const currentProject = getCurrentProject();

  if (currentProject) {

    if (!currentProject.files) {

      currentProject.files = [];

    }

    const newFile = {

      id: generateFileId(),

      name: fileName,

      description: fileDescription,

      originalName: file.name,

      size: file.size,

      type: file.type,

      extension: getFileExtension(file.name),

      uploadDate: new Date().toISOString(),

      url: URL.createObjectURL(file) // En una aplicación real, esto sería la URL del servidor

    };

    currentProject.files.push(newFile);

    // Recargar la vista del proyecto

    await loadProjectDetail(currentProject);

    showSuccessMessage('Archivo agregado exitosamente');

    hideModal('addFileModal');

    clearFileForm();

  }

}

function generateFileId() {

  return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

}

function loadProjectFiles(files) {

  const filesContainer = document.getElementById('detailFiles');

  if (!filesContainer) return;

  if (!files || files.length === 0) {

    filesContainer.innerHTML = '<p class="no-files-message">No hay archivos adjuntos para este proyecto.</p>';

    return;

  }

  filesContainer.innerHTML = '';

  const puedeGestionarGlobal = puedeGestionarGaleria();

  files.forEach(file => {

    const fileItem = document.createElement('div');

    fileItem.className = 'file-item';

    const fileIcon = document.createElement('div');

    fileIcon.className = 'file-icon';

    fileIcon.textContent = file.extension.toUpperCase();

    const fileInfo = document.createElement('div');

    fileInfo.className = 'file-info';

    const fileName = document.createElement('h4');

    fileName.textContent = file.name;

    const fileDescription = document.createElement('p');

    fileDescription.textContent = file.description || 'Sin descripción';

    const fileDate = document.createElement('div');

    fileDate.className = 'file-date';

    fileDate.textContent = new Date(file.uploadDate).toLocaleDateString('es-GT');

    fileInfo.appendChild(fileName);

    fileInfo.appendChild(fileDescription);

    fileInfo.appendChild(fileDate);

    const fileActions = document.createElement('div');
    fileActions.className = 'file-actions';

    const puedeEditar = puedeGestionarGlobal && !file.es_evidencia;
    const puedeEliminar = puedeGestionarGlobal && !file.es_evidencia;

    if (puedeGestionarGlobal) {
      const downloadBtn = document.createElement('a');
      downloadBtn.className = 'file-download-btn';
      downloadBtn.href = file.url;
      downloadBtn.download = file.originalName;
      downloadBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7,10 12,15 17,10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Descargar
      `;
      fileActions.appendChild(downloadBtn);
    }

    if (puedeEditar) {
      const editBtn = document.createElement('button');
      editBtn.className = 'file-edit-btn';
      editBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
        </svg>
        Editar
      `;
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showEditProjectFileDescriptionModal(file.id, file.description || '');
      });
      fileActions.appendChild(editBtn);
    }

    if (puedeEliminar) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-item';
      removeBtn.setAttribute('data-archivo-id', file.id);
      removeBtn.setAttribute('data-file-id', file.id);
      removeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showConfirmDeleteModal(
          `¿Estás seguro de que deseas eliminar el archivo "${file.name}"? Esta acción no se puede deshacer.`,
          async () => {
            await eliminarArchivoProyecto(file.id);
          }
        );
      });
      fileActions.appendChild(removeBtn);
    }

    fileItem.appendChild(fileIcon);

    fileItem.appendChild(fileInfo);

    if (fileActions.childElementCount > 0) {
      fileItem.appendChild(fileActions);
    }

    filesContainer.appendChild(fileItem);

  });

}

// ======= FUNCIONES DE ELIMINACIÓN =======

// Función para eliminar personal del proyecto

async function removePersonnelFromProject(personnelId, personnelType) {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  // Usar modal de confirmación personalizado
  showConfirmModal(
    '¿Estás seguro de que deseas eliminar este miembro del personal del evento?',
    async () => {
      // Ejecutar eliminación cuando el usuario confirme
      await ejecutarEliminacionPersonal(personnelId, personnelType);
    }
  );

}

// Función auxiliar para ejecutar la eliminación de personal
async function ejecutarEliminacionPersonal(personnelId, personnelType) {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('Error: No se pudo obtener la información del evento.');

    return;

  }

  try {

    // Obtener el personal actual del evento

    const currentPersonnel = currentProject.personal || [];

    // Filtrar el personal a eliminar

    const updatedPersonnel = currentPersonnel.filter(p => {

      const pId = p.id || p.colaborador_id || p.usuario_id;

      return pId !== personnelId;

    });

    // Preparar el formato para la API

    const personalIds = updatedPersonnel.map(p => ({

      id: p.id || p.colaborador_id || p.usuario_id,

      tipo: p.tipo || 'colaborador',

      rol: p.rol || 'Colaborador'

    }));

    // Crear FormData para enviar a la API

    const formData = new FormData();

    formData.append('personal_ids', JSON.stringify(personalIds));

    // Llamar a la API de actualizar evento

    const response = await fetch(`/api/evento/${currentProject.id}/actualizar/`, {

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      },

      body: formData

    });

    const result = await response.json();

    if (result.success) {

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Personal eliminado exitosamente del evento.');

    } else {

      showErrorMessage(result.error || 'Error al eliminar personal del evento.');

    }

  } catch (error) {

    showErrorMessage('Error al eliminar personal. Por favor, intenta de nuevo.');

  }

}

function removeImageFromProject(imageIndex) {

  showConfirmDeleteModal(

    '¿Estás seguro de que deseas eliminar esta imagen de la galería?',

    async () => {

      const currentProject = getCurrentProject();

      if (currentProject && currentProject.gallery) {

        currentProject.gallery.splice(imageIndex, 1);

        await loadProjectDetail(currentProject);

        showSuccessMessage('Imagen eliminada exitosamente');

      }

    }

  );

}

function removeCommunityFromProject(communityIndex) {

  showConfirmDeleteModal(

    '¿Estás seguro de que deseas quitar esta comunidad del proyecto?',

    async () => {

      const currentProject = getCurrentProject();

      if (currentProject && currentProject.communities) {

        currentProject.communities.splice(communityIndex, 1);

        await loadProjectDetail(currentProject);

        showSuccessMessage('Comunidad eliminada exitosamente');

      }

    }

  );

}

function removeChangeFromProject(changeIndex) {

  showConfirmDeleteModal(

    '¿Estás seguro de que deseas eliminar este cambio realizado?',

    async () => {

      const currentProject = getCurrentProject();

      if (currentProject && currentProject.changes) {

        currentProject.changes.splice(changeIndex, 1);

        await loadProjectDetail(currentProject);

        showSuccessMessage('Cambio eliminado exitosamente');

      }

    }

  );

}
function removeFileFromProject(fileId) {

  showCredentialsModal(() => {

    showConfirmDeleteModal(

      '¿Estás seguro de que deseas eliminar este archivo?',

      async () => {

        const currentProject = getCurrentProject();

        if (currentProject && currentProject.files) {

          currentProject.files = currentProject.files.filter(file => file.id !== fileId);

          await loadProjectDetail(currentProject);

          showSuccessMessage('Archivo eliminado exitosamente');

        }

      }

    );

  });

}
// Función para mostrar modal de confirmación

function showConfirmDeleteModal(message, callback) {

  document.getElementById('confirmMessage').textContent = message;

  pendingDeleteAction = callback;

  showModal('confirmDeleteModal');

}

// Función para ejecutar la acción de eliminación

function executeDeleteAction() {

  if (!tienePermisoGestionActual()) {
    mostrarMensajePermisoDenegado();

    pendingDeleteAction = null;

    hideModal('confirmDeleteModal');

    return;

  }

  if (!pendingDeleteAction) {
    return;
  }

  try {
    const result = pendingDeleteAction();

    if (result && typeof result.then === 'function') {
      result.finally(() => {
        hideModal('confirmDeleteModal');
        pendingDeleteAction = null;
      });
    } else {
      hideModal('confirmDeleteModal');
      pendingDeleteAction = null;
    }
  } catch (error) {
    hideModal('confirmDeleteModal');
    pendingDeleteAction = null;
  }
}

// Función para filtrar lista de personal

function filterPersonnelList() {

  const searchInput = document.getElementById('personnelSearch');

  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase();

  const personnelItems = document.querySelectorAll('.personnel-item');

  personnelItems.forEach(item => {

    const text = item.textContent.toLowerCase();

    if (text.includes(searchTerm)) {

      item.style.display = 'flex';

    } else {

      item.style.display = 'none';

    }

  });

}

// ======= FUNCIONES PARA MODALES DE SELECCIÓN =======

// Función para mostrar modal de selección de comunidades

function showCommunitySelectionModal(communities) {

  const modal = document.getElementById('communitySelectionModal');

  const list = document.getElementById('communitySelectionList');

  list.innerHTML = '';

  communities.forEach((community, index) => {

    const item = document.createElement('div');

    item.className = 'selection-item';

    item.innerHTML = `

      <input type="checkbox" class="selection-checkbox" id="community-${index}" data-index="${index}">

      <div class="selection-content">

        <h4 class="selection-title">${community.name}</h4>

        <p class="selection-subtitle">${community.region}</p>

      </div>

    `;

    list.appendChild(item);

  });

  showModal('communitySelectionModal');

  setupSelectionHandlers('communitySelectionList');

}
// Función para mostrar modal de selección de cambios

function showChangeSelectionModal(changes) {

  const modal = document.getElementById('changeSelectionModal');

  const list = document.getElementById('changeSelectionList');

  list.innerHTML = '';

  changes.forEach((change, index) => {

    const item = document.createElement('div');

    item.className = 'selection-item';

    item.innerHTML = `

      <input type="checkbox" class="selection-checkbox" id="change-${index}" data-index="${index}">

      <div class="selection-content">

        <h4 class="selection-title">${change.date}</h4>

        <p class="selection-description">${change.description}</p>

        <p class="selection-subtitle">Por: ${change.personnel}</p>

      </div>

    `;

    list.appendChild(item);

  });

  showModal('changeSelectionModal');

  setupSelectionHandlers('changeSelectionList');

}

// Función para mostrar modal de selección de archivos

function showFileSelectionModal(files) {

  const modal = document.getElementById('fileSelectionModal');

  const list = document.getElementById('fileSelectionList');

  list.innerHTML = '';

  files.forEach((file, index) => {

    const item = document.createElement('div');

    item.className = 'selection-item';

    item.innerHTML = `

      <input type="checkbox" class="selection-checkbox" id="file-${index}" data-index="${index}">

      <div class="selection-content">

        <h4 class="selection-title">${file.name}</h4>

        <p class="selection-description">${file.description || 'Sin descripción'}</p>

        <p class="selection-subtitle">${file.extension.toUpperCase()} • ${formatFileSize(file.size)}</p>

      </div>

    `;

    list.appendChild(item);

  });

  showModal('fileSelectionModal');

  setupSelectionHandlers('fileSelectionList');

}

// Función auxiliar para obtener índices seleccionados

function getSelectedIndices(listId) {

  const checkboxes = document.querySelectorAll(`#${listId} .selection-checkbox:checked`);

  return Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.index));

}

// Función para configurar selección de elementos

function setupSelectionHandlers(listId) {

  const checkboxes = document.querySelectorAll(`#${listId} .selection-checkbox`);

  checkboxes.forEach(checkbox => {

    checkbox.addEventListener('change', function() {

      const item = this.closest('.selection-item');

      if (this.checked) {

        item.classList.add('selected');

      } else {

        item.classList.remove('selected');

      }

    });

  });

}

// ======= FUNCIONES PARA EVIDENCIAS DE CAMBIOS =======

let currentChangeIndex = null;

// Función para mostrar modal de detalles de cambio (solo vista, excepto para agregar evidencias)

function showChangeDetailsModal(cambio) {

  if (!cambio) return;

  // Verificar permisos antes de mostrar el modal

  const puedeGestionar = puedeGestionarGaleria();

  if (!puedeGestionar) {

    return; // Bloquear acceso al modal para usuarios no autenticados

  }

  // Llenar información del cambio

  const fechaDisplay = cambio.fecha_display || cambio.fecha_cambio || 'Sin fecha';

  document.getElementById('changeDetailsDate').textContent = fechaDisplay;

  // Mostrar descripción del cambio como texto de solo lectura (no editable)

  const descripcionElement = document.getElementById('changeDetailsDescription');

  if (descripcionElement) {

    descripcionElement.innerHTML = '';

    const descripcionText = document.createElement('p');

    descripcionText.style.cssText = 'color: #b8c5d1; font-size: 0.9rem; line-height: 1.6; margin: 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; white-space: pre-wrap; word-wrap: break-word;';

    descripcionText.textContent = cambio.descripcion || 'Sin descripción';

    descripcionElement.appendChild(descripcionText);

  }

  document.getElementById('changeDetailsPersonnel').textContent = cambio.responsables_display || cambio.responsable || 'Sin responsable';

  // Mostrar comunidades donde se trabajó
  const comunidadesInfo = document.getElementById('changeDetailsCommunities');
  if (comunidadesInfo) {
    const comunidadesText = (cambio.comunidades && cambio.comunidades.trim() !== '') 
      ? cambio.comunidades 
      : (cambio.comunidades_nombres && cambio.comunidades_nombres.trim() !== '') 
        ? cambio.comunidades_nombres 
        : null;
    
    if (comunidadesText && comunidadesText.trim() !== '' && comunidadesText !== 'Sin comunidades') {
      comunidadesInfo.innerHTML = `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="display: flex; align-items: center; gap: 8px; color: #0ea5e9; font-size: 0.9rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <strong>Trabajado en:</strong> <span>${escapeHtml(comunidadesText)}</span>
          </div>
        </div>
      `;
    } else {
      comunidadesInfo.innerHTML = '';
    }
  }

  // Cargar evidencias (pasar permisos, pero NO permitir eliminar en modal de detalles - solo lectura)
  // En el modal de detalles NO se pueden eliminar evidencias, solo verlas

  loadEvidences(cambio.evidencias || [], puedeGestionar, false);

  // Guardar el ID del cambio actual para agregar evidencias

  currentCambioId = cambio.id;

  // Ocultar botón de agregar evidencia en el modal de detalles (solo lectura)
  // Las evidencias solo se pueden agregar/eliminar al editar el cambio

  const addEvidenceBtn = document.getElementById('addEvidenceBtn');

  if (addEvidenceBtn) {

    addEvidenceBtn.style.display = 'none'; // Siempre oculto en modal de detalles

  }

  showModal('changeDetailsModal');

}

// Función para actualizar descripción del cambio

async function actualizarDescripcionCambio(cambioId, descripcion) {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id) {

    showErrorMessage('No se pudo obtener la información del proyecto');

    return;

  }

  try {

    const formData = new FormData();

    formData.append('descripcion', descripcion);

    const response = await fetch(`/api/evento/${currentProject.id}/cambio/${cambioId}/actualizar/`, {

      method: 'POST',

      body: formData,

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    const result = await response.json();

    if (result.success) {

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Descripción del cambio actualizada exitosamente');

      // Reabrir el modal de detalles del cambio con los datos actualizados

      const cambioActualizado = currentProjectData?.cambios?.find(c => c.id === cambioId);

      if (cambioActualizado) {

        showChangeDetailsModal(cambioActualizado);

      }

    } else {

      showErrorMessage(result.error || 'Error al actualizar descripción');

    }

  } catch (error) {

    showErrorMessage('Error al actualizar descripción. Por favor, intenta de nuevo.');

  }

}

// Variable para almacenar el ID del cambio actual en el modal de detalles

let currentCambioId = null;

// Función para editar descripción de evidencia

function editarDescripcionEvidencia(evidenciaId, evidence) {

  const descripcionActual = evidence.descripcion || '';

  const nuevaDescripcion = prompt('Ingresa la descripción para esta evidencia:', descripcionActual);

  if (nuevaDescripcion === null) {

    return; // Usuario canceló

  }

  actualizarDescripcionEvidencia(evidenciaId, nuevaDescripcion.trim());

}

// Función para actualizar descripción de evidencia usando API

async function actualizarDescripcionEvidencia(evidenciaId, descripcion) {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id || !currentCambioId) {

    showErrorMessage('No se pudo obtener la información del cambio');

    return;

  }

  try {

    const formData = new FormData();

    formData.append('descripcion', descripcion);

    const response = await fetch(`/api/evento/${currentProject.id}/cambio/${currentCambioId}/evidencia/${evidenciaId}/actualizar/`, {

      method: 'POST',

      body: formData,

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    const result = await response.json();

    if (result.success) {

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Descripción actualizada exitosamente');

      // Reabrir el modal de detalles del cambio con datos actualizados

      const cambio = currentProjectData?.cambios?.find(c => c.id === currentCambioId);

      if (cambio) {

        // Actualizar el objeto evidence en el array para reflejar el cambio

        const evidenceIndex = cambio.evidencias?.findIndex(e => e.id === evidenciaId);

        if (evidenceIndex !== undefined && evidenceIndex !== -1 && cambio.evidencias) {

          cambio.evidencias[evidenceIndex].descripcion = descripcion;

        }

        showChangeDetailsModal(cambio);

      }

    } else {

      showErrorMessage(result.error || 'Error al actualizar descripción');

    }

  } catch (error) {

    showErrorMessage('Error al actualizar descripción. Por favor, intenta de nuevo.');

  }

}

// Función para cargar evidencias

function loadEvidences(evidences, puedeGestionar = false, permiteEliminar = false) {

  const grid = document.getElementById('evidencesGrid');

  if (!grid) return;

  // Aplicar estilos mejorados al grid para evitar que se vea amontonado

  grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; padding: 20px 0;';

  grid.innerHTML = '';

  if (!evidences || evidences.length === 0) {

    grid.innerHTML = `

      <div class="no-evidences" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6c757d;">

        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 16px;">

          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>

          <polyline points="14,2 14,8 20,8"></polyline>

        </svg>

        <p style="margin: 8px 0; font-size: 1rem;">No hay evidencias para este cambio</p>

        ${puedeGestionar ? '<p style="margin: 8px 0; font-size: 0.9rem; color: #6c757d;">Haz clic en "Agregar Evidencia" para comenzar</p>' : ''}

      </div>

    `;

    return;

  }

  evidences.forEach((evidence) => {

    const evidenceItem = document.createElement('div');

    evidenceItem.className = 'evidence-item';

    evidenceItem.style.cssText = 'background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s, box-shadow 0.2s;';

    evidenceItem.onmouseover = function() { 

      this.style.transform = 'translateY(-2px)'; 

      this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; 

    };

    evidenceItem.onmouseout = function() { 

      this.style.transform = 'translateY(0)'; 

      this.style.boxShadow = 'none'; 

    };

    const isImage = evidence.tipo && evidence.tipo.startsWith('image/');

    const nombreArchivo = evidence.nombre || evidence.archivo_nombre || 'Sin nombre';

    // Si puede gestionar, mostrar enlace clickeable, si no, solo texto

    const nombreArchivoHTML = puedeGestionar 

      ? `<a href="${evidence.url}" target="_blank" style="color: #007bff; text-decoration: none; font-weight: 500; font-size: 0.9rem; flex: 1; min-width: 0; word-break: break-word;" title="${nombreArchivo}" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${nombreArchivo}</a>`

      : `<span style="color: #6c757d; font-weight: 500; font-size: 0.9rem; flex: 1; min-width: 0; word-break: break-word; cursor: not-allowed;" title="Debes iniciar sesión como admin o personal para ver/descargar evidencias">${nombreArchivo}</span>`;

    // Botón de eliminar solo si tiene permisos Y se permite eliminar (modo edición)
    // En el modal de detalles (solo lectura) NO se muestra el botón de eliminar

    const botonEliminarHTML = (puedeGestionar && permiteEliminar)

      ? `<button class="evidence-remove" data-evidence-id="${evidence.id}" style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; transition: background 0.2s; flex-shrink: 0;" title="Eliminar evidencia" onmouseover="this.style.background='#dc3545'" onmouseout="this.style.background='rgba(220, 53, 69, 0.9)'">

          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

            <line x1="18" y1="6" x2="6" y2="18"></line>

            <line x1="6" y1="6" x2="18" y2="18"></line>

          </svg>

        </button>`

      : '';

    evidenceItem.innerHTML = `

      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">

        ${isImage ? 

          `<img src="${evidence.url}" alt="${nombreArchivo}" class="evidence-image" loading="lazy" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">` :

          `<div class="evidence-file-icon" style="font-size: 1.8rem; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: rgba(0, 123, 255, 0.2); border-radius: 6px; flex-shrink: 0;">📄</div>`

        }

        <div style="flex: 1; min-width: 0;">

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">

            ${nombreArchivoHTML}

            ${botonEliminarHTML}

          </div>

          <div style="color: #6c757d; font-size: 0.8rem; margin-bottom: 8px;">${evidence.tipo || 'Archivo'}</div>

        </div>

      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">

        <label style="color: #b8c5d1; font-size: 0.85rem; display: block; margin-bottom: 6px;">Descripción:</label>

        <p style="color: #fff; font-size: 0.9rem; margin: 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; min-height: 40px;">${evidence.descripcion || '<span style="color: #6c757d; font-style: italic;">Sin descripción</span>'}</p>

      </div>

    `;

    grid.appendChild(evidenceItem);

  });

  // Agregar event listeners para eliminar evidencias

  grid.querySelectorAll('.evidence-remove').forEach(btn => {

    btn.addEventListener('click', async function(e) {

      e.stopPropagation();

      const evidenciaId = this.getAttribute('data-evidence-id');

      await eliminarEvidenciaCambio(evidenciaId);

    });

  });

}
// Función para mostrar modal de agregar evidencia

function showAddEvidenceModal() {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentCambioId) {

    showErrorMessage('No se pudo obtener la información del cambio');

    return;

  }

  const cambio = currentProject.cambios?.find(c => c.id === currentCambioId);

  if (cambio && cambio.evidencias && cambio.evidencias.length >= 10) {

    showErrorMessage('Máximo 10 evidencias por cambio');

    return;

  }

  showModal('addEvidenceModal');

  clearEvidenceForm();

}

// Función para limpiar formulario de evidencia

function clearEvidenceForm() {

  document.getElementById('evidenceInput').value = '';

  document.getElementById('evidenceDescription').value = '';

  document.getElementById('evidencePreview').innerHTML = '';

  selectedEvidenceFile = null;

}
// Variable para almacenar el archivo de evidencia seleccionado
let selectedEvidenceFile = null;
// Función para manejar selección de archivo de evidencia

function handleEvidenceSelect() {

  const fileInput = document.getElementById('evidenceInput');

  const preview = document.getElementById('evidencePreview');

  if (fileInput.files && fileInput.files[0]) {

    const file = fileInput.files[0];

    selectedEvidenceFile = file;

    const isImage = file.type.startsWith('image/');

    preview.innerHTML = `

      <div class="file-preview-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">

        <div class="file-preview-icon" style="font-size: 2rem; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: rgba(0, 123, 255, 0.2); border-radius: 8px;">${isImage ? '🖼️' : '📄'}</div>

        <div style="flex: 1; min-width: 0;">

          <div class="file-preview-name" style="font-weight: 500; color: #fff; font-size: 0.9rem; margin-bottom: 4px; word-break: break-word;">${file.name}</div>

          <div class="file-preview-size" style="color: #6c757d; font-size: 0.85rem;">${formatFileSize(file.size)}</div>

        </div>

        <button type="button" class="remove-evidence-file-btn" style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; transition: background 0.2s;" title="Eliminar archivo" onmouseover="this.style.background='#dc3545'" onmouseout="this.style.background='rgba(220, 53, 69, 0.9)'">

          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">

            <line x1="18" y1="6" x2="6" y2="18"></line>

            <line x1="6" y1="6" x2="18" y2="18"></line>

          </svg>

        </button>

      </div>

    `;

    // Agregar event listener para eliminar archivo

    const removeBtn = preview.querySelector('.remove-evidence-file-btn');

    if (removeBtn) {

      removeBtn.addEventListener('click', function() {

        selectedEvidenceFile = null;

        fileInput.value = '';

        preview.innerHTML = '';

      });

    }

  }

}
// Función para agregar evidencia a un cambio existente usando API

async function addEvidenceToChange() {

  if (!tienePermisoGestionActual()) {

    mostrarMensajePermisoDenegado();

    return;

  }

  const fileInput = document.getElementById('evidenceInput');

  const description = document.getElementById('evidenceDescription').value.trim();

  // Usar el archivo seleccionado (de selectedEvidenceFile o del input)

  const file = selectedEvidenceFile || (fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);

  if (!file) {

    showErrorMessage('Por favor selecciona un archivo');

    return;

  }

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id || !currentCambioId) {

    showErrorMessage('No se pudo obtener la información del cambio');

    return;

  }

  try {

    const formData = new FormData();

    formData.append('archivo', file);

    if (description) {

      formData.append('descripcion', description);

    }

    const response = await fetch(`/api/evento/${currentProject.id}/cambio/${currentCambioId}/evidencia/agregar/`, {

      method: 'POST',

      body: formData,

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    const result = await response.json();

    if (result.success) {

      hideModal('addEvidenceModal');

      clearEvidenceForm();

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Evidencia agregada exitosamente');

      // Reabrir el modal de detalles del cambio con datos actualizados

      const cambio = currentProjectData?.cambios?.find(c => c.id === currentCambioId);

      if (cambio) {

        showChangeDetailsModal(cambio);

      }

    } else {

      showErrorMessage(result.error || 'Error al agregar evidencia');

    }

  } catch (error) {

    showErrorMessage('Error al agregar evidencia. Por favor, intenta de nuevo.');

  }

}

// Función para eliminar evidencia de un cambio usando API

async function eliminarEvidenciaCambio(evidenciaId) {

  const currentProject = getCurrentProject();

  if (!currentProject || !currentProject.id || !currentCambioId) {

    showErrorMessage('No se pudo obtener la información del cambio');

    return;

  }

  // Usar modal de confirmación personalizado en lugar de confirm()
  showConfirmModal(
    '¿Estás seguro de que deseas eliminar esta evidencia?',
    async () => {
      // Ejecutar eliminación cuando el usuario confirme
      await ejecutarEliminacionEvidencia(evidenciaId);
    }
  );

}

// Función auxiliar para ejecutar la eliminación de evidencia
async function ejecutarEliminacionEvidencia(evidenciaId) {

  const currentProject = getCurrentProject();
  
  // Usar editingCambioId como respaldo si currentCambioId no está definido
  const cambioIdParaEliminar = currentCambioId || editingCambioId;

  if (!currentProject || !currentProject.id || !cambioIdParaEliminar) {

    showErrorMessage('No se pudo obtener la información del cambio');

    return;

  }

  try {

    const response = await fetch(`/api/evento/${currentProject.id}/cambio/${cambioIdParaEliminar}/evidencia/${evidenciaId}/eliminar/`, {

      method: 'POST',

      headers: {

        'X-CSRFToken': getCookie('csrftoken')

      }

    });

    // Verificar si la respuesta es exitosa o es un 404 (evidencia ya eliminada)
    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      // Si no se puede parsear JSON, lanzar error
      throw new Error('Respuesta inválida del servidor');
    }

    // Si es 404 y el error indica que la evidencia no existe, considerar como eliminación exitosa
    // (la evidencia ya fue eliminada anteriormente)
    if (response.status === 404 && result.error && result.error.includes('Evidencia no encontrada')) {
      
      // Esperar un momento para asegurar que el backend haya procesado completamente
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Actualizar la vista en tiempo real
      await refreshCurrentProject('La evidencia ya fue eliminada. Actualizando la vista...');
      
      // Esperar un momento adicional para asegurar que currentProjectData se haya actualizado
      await new Promise(resolve => setTimeout(resolve, 200));

      // Obtener los datos actualizados del proyecto desde el servidor
      const proyectoActualizado = getCurrentProject();
      if (!proyectoActualizado || !proyectoActualizado.id) {
        showErrorMessage('No se pudo obtener la información del proyecto actualizado');
        return;
      }

      // Recargar los datos del proyecto desde el servidor para asegurar que las evidencias estén actualizadas
      await refreshCurrentProject();
      
      // Esperar un momento más para asegurar que los datos se hayan actualizado completamente
      await new Promise(resolve => setTimeout(resolve, 300));

      // Obtener el cambio actualizado desde los datos frescos del servidor
      const proyectoFresco = getCurrentProject();
      const cambio = proyectoFresco?.cambios?.find(c => c.id === cambioIdParaEliminar || (c.ids && c.ids.includes(cambioIdParaEliminar)));

      if (cambio) {
        // Actualizar currentCambioId y editingCambioId con el ID del grupo si es necesario
        if (cambio.id !== cambioIdParaEliminar && cambio.ids && cambio.ids.includes(cambioIdParaEliminar)) {
          currentCambioId = cambio.id;
          editingCambioId = cambio.id;
        }
        
        // Verificar qué modal está abierto y actualizar el correspondiente
        const addChangeModal = document.getElementById('addChangeModal');
        const changeDetailsModal = document.getElementById('changeDetailsModal');
        const isEditModalOpen = addChangeModal && window.getComputedStyle(addChangeModal).display !== 'none';
        const isDetailsModalOpen = changeDetailsModal && window.getComputedStyle(changeDetailsModal).display !== 'none';
        
        if (isEditModalOpen) {
          // Si estamos en el modal de edición, actualizar el preview de evidencias
          renderExistingEvidences(cambio.evidencias || []);
          
          // Remover la evidencia de la lista de evidencias a eliminar si estaba marcada
          const evidenciaIndex = evidenciasAEliminar.indexOf(evidenciaId);
          if (evidenciaIndex > -1) {
            evidenciasAEliminar.splice(evidenciaIndex, 1);
          }
        } else if (isDetailsModalOpen) {
          // Si estamos en el modal de detalles, reabrir el modal con los datos actualizados
          showChangeDetailsModal(cambio);
        } else {
          // Si ningún modal está abierto, abrir el modal de detalles
          showChangeDetailsModal(cambio);
        }
      } else {
        showErrorMessage('No se pudo encontrar el cambio actualizado');
      }

      return;

    }

    if (result.success) {

      // Esperar un momento para asegurar que el backend haya procesado completamente la eliminación
      await new Promise(resolve => setTimeout(resolve, 300));

      // Actualizar la vista en tiempo real
      await refreshCurrentProject('Evidencia eliminada exitosamente');
      
      // Esperar un momento adicional para asegurar que currentProjectData se haya actualizado
      await new Promise(resolve => setTimeout(resolve, 200));

      // Obtener los datos actualizados del proyecto desde el servidor
      const proyectoActualizado = getCurrentProject();
      if (!proyectoActualizado || !proyectoActualizado.id) {
        showErrorMessage('No se pudo obtener la información del proyecto actualizado');
        return;
      }

      // Recargar los datos del proyecto desde el servidor para asegurar que las evidencias estén actualizadas
      await refreshCurrentProject();
      
      // Esperar un momento más para asegurar que los datos se hayan actualizado completamente
      await new Promise(resolve => setTimeout(resolve, 300));

      // Obtener el cambio actualizado desde los datos frescos del servidor
      const proyectoFresco = getCurrentProject();
      const cambio = proyectoFresco?.cambios?.find(c => c.id === cambioIdParaEliminar || (c.ids && c.ids.includes(cambioIdParaEliminar)));

      if (cambio) {
        // Actualizar currentCambioId y editingCambioId con el ID del grupo si es necesario
        if (cambio.id !== cambioIdParaEliminar && cambio.ids && cambio.ids.includes(cambioIdParaEliminar)) {
          currentCambioId = cambio.id;
          editingCambioId = cambio.id;
        }
        
        // Verificar qué modal está abierto y actualizar el correspondiente
        const addChangeModal = document.getElementById('addChangeModal');
        const changeDetailsModal = document.getElementById('changeDetailsModal');
        const isEditModalOpen = addChangeModal && window.getComputedStyle(addChangeModal).display !== 'none';
        const isDetailsModalOpen = changeDetailsModal && window.getComputedStyle(changeDetailsModal).display !== 'none';
        
        if (isEditModalOpen) {
          // Si estamos en el modal de edición, actualizar el preview de evidencias
          renderExistingEvidences(cambio.evidencias || []);
          
          // Remover la evidencia de la lista de evidencias a eliminar si estaba marcada
          const evidenciaIndex = evidenciasAEliminar.indexOf(evidenciaId);
          if (evidenciaIndex > -1) {
            evidenciasAEliminar.splice(evidenciaIndex, 1);
          }
        } else if (isDetailsModalOpen) {
          // Si estamos en el modal de detalles, reabrir el modal con los datos actualizados
          showChangeDetailsModal(cambio);
        } else {
          // Si ningún modal está abierto, abrir el modal de detalles
          showChangeDetailsModal(cambio);
        }
      } else {
        showErrorMessage('No se pudo encontrar el cambio actualizado');
      }

    } else {

      showErrorMessage(result.error || 'Error al eliminar evidencia');

    }

  } catch (error) {

    console.error('Error al eliminar evidencia:', error);
    showErrorMessage('Error al eliminar evidencia. Por favor, intenta de nuevo.');

    // Intentar actualizar el UI de todas formas para sincronizar con el estado real
    try {
      // Esperar un momento antes de actualizar
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await refreshCurrentProject();
      
      // Esperar un momento adicional para asegurar que currentProjectData se haya actualizado
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const proyectoActualizado = getCurrentProject();
      const cambioIdParaBuscar = currentCambioId || editingCambioId;
      const cambio = proyectoActualizado?.cambios?.find(c => c.id === cambioIdParaBuscar || (c.ids && c.ids.includes(cambioIdParaBuscar)));
      if (cambio) {
        // Actualizar currentCambioId y editingCambioId con el ID del grupo si es necesario
        if (cambio.id !== cambioIdParaBuscar && cambio.ids && cambio.ids.includes(cambioIdParaBuscar)) {
          currentCambioId = cambio.id;
          editingCambioId = cambio.id;
        }
        
        // Verificar qué modal está abierto y actualizar el correspondiente
        const addChangeModal = document.getElementById('addChangeModal');
        const changeDetailsModal = document.getElementById('changeDetailsModal');
        const isEditModalOpen = addChangeModal && window.getComputedStyle(addChangeModal).display !== 'none';
        const isDetailsModalOpen = changeDetailsModal && window.getComputedStyle(changeDetailsModal).display !== 'none';
        
        if (isEditModalOpen) {
          // Si estamos en el modal de edición, actualizar el preview de evidencias
          renderExistingEvidences(cambio.evidencias || []);
        } else if (isDetailsModalOpen) {
          // Si estamos en el modal de detalles, reabrir el modal con los datos actualizados
          showChangeDetailsModal(cambio);
        } else {
          // Si ningún modal está abierto, abrir el modal de detalles
          showChangeDetailsModal(cambio);
        }
      }
    } catch (updateError) {
      console.error('Error al actualizar UI:', updateError);
    }

  }

}

// Función para manejar selección de archivos de evidencias en el modal de cambios

function handleChangeEvidencesSelect(event) {

  const files = event.target.files;

  const preview = document.getElementById('changeEvidencesPreview');

  if (!preview) {
    return;
  }

  // Agregar nuevos archivos al array

  if (files && files.length > 0) {

    Array.from(files).forEach(file => {

      selectedEvidencesFiles.push({

        file: file,

        id: Date.now() + Math.random(), // ID único para cada archivo

        descripcion: '' // Inicializar descripción vacía

      });

    });

  }

  // Renderizar todos los archivos seleccionados

  renderEvidencesPreview();

  // Limpiar el input para permitir seleccionar el mismo archivo de nuevo

  event.target.value = '';

}

// Función para renderizar evidencias existentes en el modal de edición

function renderExistingEvidences(evidencias) {

  const preview = document.getElementById('changeEvidencesPreview');

  if (!preview) return;

  // Limpiar solo si no hay evidencias nuevas

  if (selectedEvidencesFiles.length === 0) {

    preview.innerHTML = '';

  }

  if (!evidencias || evidencias.length === 0) {

    if (selectedEvidencesFiles.length === 0) {

      preview.innerHTML = '<p style="color: #6c757d; padding: 12px; text-align: center;">No hay evidencias para este cambio.</p>';

    }

    return;

  }

  evidencias.forEach((evidencia) => {

    const fileDiv = document.createElement('div');

    fileDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(0, 123, 255, 0.1); border: 1px solid rgba(0, 123, 255, 0.3); border-radius: 8px; margin-top: 8px;';

    fileDiv.setAttribute('data-evidence-id', evidencia.id);

    fileDiv.setAttribute('data-evidence-existing', 'true');

    const isImage = evidencia.tipo && evidencia.tipo.startsWith('image/');

    const nombreArchivo = evidencia.nombre || evidencia.archivo_nombre || 'Sin nombre';

    // Guardar descripción original para comparar cambios

    const descripcionOriginal = evidencia.descripcion || '';

    // Escapar comillas para el atributo HTML data-original-desc

    const descripcionOriginalEscaped = descripcionOriginal.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    fileDiv.innerHTML = `

      <div style="display: flex; align-items: center; gap: 10px;">

        ${isImage ? 

          `<img src="${evidencia.url}" alt="${nombreArchivo}" loading="lazy" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">` :

          `<div style="width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">📄</div>`

        }

        <span style="color: #fff; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(nombreArchivo)}">${escapeHtml(nombreArchivo)}</span>

        <a href="${evidencia.url}" target="_blank" style="color: #007bff; text-decoration: none; margin-right: 8px; flex-shrink: 0;" title="Ver archivo">

          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">

            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>

            <polyline points="15 3 21 3 21 9"></polyline>

            <line x1="10" y1="14" x2="21" y2="3"></line>

          </svg>

        </a>

        <span style="color: #6c757d; font-size: 0.8rem; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">Existente</span>
        
        <button type="button" class="btn-remove-evidence-existing" data-evidence-id="${evidencia.id}" style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-left: 8px; transition: background 0.2s; flex-shrink: 0;" title="Marcar para eliminar" onmouseover="this.style.background='#dc3545'" onmouseout="this.style.background='rgba(220, 53, 69, 0.9)'">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

      </div>

      <div class="evidence-description-container" style="display: flex; flex-direction: column; gap: 4px;">

        <label style="color: #b8c5d1; font-size: 0.85rem;">Descripción:</label>

        <textarea class="evidence-description-input-existing" data-evidence-id="${evidencia.id}" data-original-desc="${descripcionOriginalEscaped}" rows="2" placeholder="Agregar descripción..." style="width: 100%; padding: 8px; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 0.9rem; resize: vertical; font-family: inherit;">${descripcionOriginal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>

      </div>

    `;

    // Insertar antes de las evidencias nuevas si existen

    if (selectedEvidencesFiles.length > 0) {

      const firstNewEvidence = preview.querySelector('[data-evidence-existing]');

      if (firstNewEvidence) {

        preview.insertBefore(fileDiv, firstNewEvidence);

      } else {

        preview.appendChild(fileDiv);

      }

    } else {

      preview.appendChild(fileDiv);

    }

  });

  // Agregar event listeners para botones de eliminar evidencias existentes
  preview.querySelectorAll('.btn-remove-evidence-existing').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const evidenciaId = this.getAttribute('data-evidence-id');
      
      // Marcar evidencia para eliminación (se eliminará al guardar)
      if (!evidenciasAEliminar.includes(evidenciaId)) {
        evidenciasAEliminar.push(evidenciaId);
        
        // Marcar visualmente como eliminado
        const evidenceDiv = this.closest('[data-evidence-existing="true"]');
        if (evidenceDiv) {
          evidenceDiv.style.opacity = '0.5';
          evidenceDiv.style.textDecoration = 'line-through';
          this.disabled = true;
          this.title = 'Marcado para eliminar';
        }
        
        console.log(`Evidencia ${evidenciaId} marcada para eliminación. Total: ${evidenciasAEliminar.length}`);
      }
    });
  });

}

function renderEvidencesPreview() {

  const preview = document.getElementById('changeEvidencesPreview');

  if (!preview) return;

  // Guardar evidencias existentes antes de limpiar las nuevas

  const existingEvidences = Array.from(preview.querySelectorAll('[data-evidence-existing="true"]'));

  const existingEvidencesHTML = existingEvidences.map(el => el.outerHTML).join('');

  // Eliminar solo las evidencias nuevas (las que no tienen el atributo data-evidence-existing)

  const newEvidences = Array.from(preview.querySelectorAll('[data-file-id]:not([data-evidence-existing])'));

  newEvidences.forEach(el => el.remove());

  if (selectedEvidencesFiles.length === 0) {

    // Si no hay evidencias nuevas, restaurar las existentes o mostrar mensaje

    if (existingEvidencesHTML) {

      preview.innerHTML = existingEvidencesHTML;

    } else if (editingCambioId) {

      // Si estamos editando pero no hay evidencias nuevas ni existentes

      preview.innerHTML = '<p style="color: #6c757d; padding: 12px; text-align: center;">No hay evidencias nuevas seleccionadas.</p>';

    } else {

  preview.innerHTML = '';

    }

    return;

  }

  // Reconstruir: primero las existentes, luego las nuevas

  preview.innerHTML = existingEvidencesHTML;

  selectedEvidencesFiles.forEach((fileItem, index) => {

    const fileDiv = document.createElement('div');

    fileDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-top: 8px;';

    fileDiv.setAttribute('data-file-id', fileItem.id);

    fileDiv.innerHTML = `

      <div style="display: flex; align-items: center; gap: 10px;">

      <span style="color: #fff; flex: 1;">${fileItem.file.name}</span>

      <button type="button" class="remove-evidence-btn" data-file-id="${fileItem.id}" style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;" title="Eliminar archivo">

        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">

          <line x1="18" y1="6" x2="6" y2="18"></line>

          <line x1="6" y1="6" x2="18" y2="18"></line>

        </svg>

      </button>

      </div>

      <div class="evidence-description-container" style="display: flex; flex-direction: column; gap: 4px;">

        <label style="color: #b8c5d1; font-size: 0.85rem;">Descripción (opcional):</label>

        <textarea class="evidence-description-input" data-file-id="${fileItem.id}" rows="2" placeholder="Agregar descripción para esta evidencia..." style="width: 100%; padding: 8px; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 0.9rem; resize: vertical;">${fileItem.descripcion || ''}</textarea>

      </div>

    `;

    preview.appendChild(fileDiv);

    // Agregar event listener para actualizar descripción cuando se escriba

    const textarea = fileDiv.querySelector('.evidence-description-input');

    if (textarea) {

      textarea.addEventListener('input', function(e) {

        const fileId = this.getAttribute('data-file-id');

        const fileItem = selectedEvidencesFiles.find(f => f.id == fileId);

        if (fileItem) {

          fileItem.descripcion = this.value.trim();

        }

      });

    }

  });

  // Agregar event listeners a los botones de eliminar

  preview.querySelectorAll('.remove-evidence-btn').forEach(btn => {

    btn.addEventListener('click', function(e) {

      e.stopPropagation();

      const fileId = this.getAttribute('data-file-id');

      removeEvidenceFile(fileId);

    });

  });

}

function removeEvidenceFile(fileId) {

  selectedEvidencesFiles = selectedEvidencesFiles.filter(item => item.id !== parseFloat(fileId));

  renderEvidencesPreview();

}

document.addEventListener('click', function(event) {
  const pendingRemoveButton = event.target.closest('.image-preview-remove');
  if (pendingRemoveButton && pendingRemoveButton.dataset.index) {
    event.preventDefault();
    const index = parseInt(pendingRemoveButton.dataset.index, 10);
    if (!Number.isNaN(index)) {
      const removedItems = pendingProjectGalleryImages.splice(index, 1);
      removedItems.forEach(revokePendingImagePreview);
      renderPendingProjectImages();
    }
    return;
  }
});