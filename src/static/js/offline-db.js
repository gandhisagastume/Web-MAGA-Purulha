// offline-db.js - Gestión de IndexedDB para datos offline
// Sistema Web-MAGA-Purulhá

const DB_NAME = 'webmaga_offline';
const DB_VERSION = 2; // Incrementado para actualizar el índice de regiones

const STORES = {
  PROYECTOS: 'proyectos',
  COMUNIDADES: 'comunidades',
  REGIONES: 'regiones',
  BENEFICIARIOS: 'beneficiarios',
  TIPOS_ACTIVIDAD: 'tipos_actividad',
  PERSONAL: 'personal',
  COLABORADORES: 'colaboradores',
};

class OfflineDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB abierto correctamente');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        console.log(`🔄 Actualizando IndexedDB de versión ${oldVersion} a ${DB_VERSION}...`);

        // Store de Proyectos/Actividades
        if (!db.objectStoreNames.contains(STORES.PROYECTOS)) {
          const store = db.createObjectStore(STORES.PROYECTOS, { keyPath: 'id' });
          store.createIndex('tipo', 'tipo', { unique: false });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
          store.createIndex('ultimo_sync', 'ultimo_sync', { unique: false });
          store.createIndex('modificado_offline', 'modificado_offline', { unique: false });
          console.log('✅ Store de proyectos creado');
        }

        // Store de Comunidades
        if (!db.objectStoreNames.contains(STORES.COMUNIDADES)) {
          const store = db.createObjectStore(STORES.COMUNIDADES, { keyPath: 'id' });
          store.createIndex('region_id', 'region_id', { unique: false });
          store.createIndex('nombre', 'nombre', { unique: false });
          store.createIndex('ultimo_sync', 'ultimo_sync', { unique: false });
          console.log('✅ Store de comunidades creado');
        }

        // Store de Regiones - Migraćión de versión 1 a 2: cambiar índice codigo a no único
        if (db.objectStoreNames.contains(STORES.REGIONES) && oldVersion < 2) {
          // Eliminar el store existente y recrearlo con el nuevo índice
          console.log('🔄 Migrando store de regiones (índice codigo a no único)...');
          db.deleteObjectStore(STORES.REGIONES);
        }
        
        if (!db.objectStoreNames.contains(STORES.REGIONES)) {
          const store = db.createObjectStore(STORES.REGIONES, { keyPath: 'id' });
          store.createIndex('codigo', 'codigo', { unique: false }); // Cambiado a false para evitar errores de duplicados
          store.createIndex('ultimo_sync', 'ultimo_sync', { unique: false });
          console.log('✅ Store de regiones creado/actualizado');
        }

        // Store de Beneficiarios
        if (!db.objectStoreNames.contains(STORES.BENEFICIARIOS)) {
          const store = db.createObjectStore(STORES.BENEFICIARIOS, { keyPath: 'id' });
          store.createIndex('comunidad_id', 'comunidad_id', { unique: false });
          store.createIndex('tipo', 'tipo', { unique: false });
          console.log('✅ Store de beneficiarios creado');
        }

        // Store de Tipos de Actividad
        if (!db.objectStoreNames.contains(STORES.TIPOS_ACTIVIDAD)) {
          db.createObjectStore(STORES.TIPOS_ACTIVIDAD, { keyPath: 'id' });
          console.log('✅ Store de tipos de actividad creado');
        }

        // Store de Personal
        if (!db.objectStoreNames.contains(STORES.PERSONAL)) {
          db.createObjectStore(STORES.PERSONAL, { keyPath: 'id' });
          console.log('✅ Store de personal creado');
        }

        // Store de Colaboradores
        if (!db.objectStoreNames.contains(STORES.COLABORADORES)) {
          db.createObjectStore(STORES.COLABORADORES, { keyPath: 'id' });
          console.log('✅ Store de colaboradores creado');
        }
      };
    });
  }

  // Métodos genéricos para CRUD
  async add(storeName, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName, indexName = null, query = null) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const request = query ? source.getAll(query) : source.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName, indexName = null, query = null) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const request = query ? source.count(query) : source.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // =====================================================
  // MÉTODOS ESPECÍFICOS PARA PROYECTOS
  // =====================================================

  async saveProyecto(proyecto) {
    const data = {
      ...proyecto,
      saved_at: new Date().toISOString(),
      is_offline: true,
    };
    return this.put(STORES.PROYECTOS, data);
  }

  async getProyecto(id) {
    return this.get(STORES.PROYECTOS, id);
  }

  async getAllProyectos(tipo = null) {
    const all = await this.getAll(STORES.PROYECTOS);
    console.log(`🔍 getAllProyectos: Total proyectos en IndexedDB: ${all?.length || 0}, tipo solicitado: ${tipo || 'todos'}`);
    
    if (tipo) {
      // Mapeo de tipos: nombres del API -> claves de categoría
      // El servidor puede devolver: "Capacitación", "Entrega", "Proyecto de Ayuda"
      // Y necesitamos mapearlos a: "capacitaciones", "entregas", "proyectos-ayuda"
      const tipoMap = {
        'capacitaciones': [
          'capacitaciones', 'capacitación', 'capacitacion', 
          'Capacitación', 'Capacitacion', 'CAPACITACIÓN',
          'capacitaciones', 'capacitación'
        ],
        'entregas': [
          'entregas', 'entrega', 'Entrega', 'ENTREGA'
        ],
        'proyectos-ayuda': [
          'proyectos-ayuda', 'proyecto de ayuda', 'proyectos de ayuda',
          'Proyecto de Ayuda', 'Proyectos de Ayuda', 'PROYECTO DE AYUDA',
          'proyecto ayuda', 'Proyecto Ayuda', 'proyecto de ayuda'
        ]
      };
      
      // Mapeo inverso: de nombre del servidor a clave de categoría (case-insensitive)
      // Nota: Las claves están en minúsculas porque el código normaliza antes de buscar
      const tipoToCategoryKey = {
        'capacitación': 'capacitaciones',
        'capacitacion': 'capacitaciones',
        'capacitaciones': 'capacitaciones',
        'entrega': 'entregas',
        'entregas': 'entregas',
        'proyecto de ayuda': 'proyectos-ayuda',
        'proyectos de ayuda': 'proyectos-ayuda',
        'proyecto ayuda': 'proyectos-ayuda',
        'proyectos-ayuda': 'proyectos-ayuda',
        // Agregar variaciones comunes que pueden venir de la inferencia
        'proyecto': 'proyectos-ayuda', // Si solo dice "proyecto"
        'ayuda': 'proyectos-ayuda', // Si solo dice "ayuda"
        // Variaciones con mayúsculas/minúsculas que pueden venir de la inferencia
        'proyecto de ayuda': 'proyectos-ayuda',
        'Proyecto de Ayuda': 'proyectos-ayuda',
        'PROYECTO DE AYUDA': 'proyectos-ayuda'
      };
      
      // Función auxiliar para inferir categoría desde el nombre (definida fuera del filter para reutilización)
      const inferirCategoriaDesdeNombre = (nombre) => {
        if (!nombre) return null;
        // Normalizar el nombre: trim para quitar espacios al inicio/final y convertir a minúsculas
        const nombreLower = String(nombre).trim().toLowerCase();
        console.log(`🔍 [INFERENCIA] Analizando nombre: "${nombre}" (normalizado: "${nombreLower}")`);
        
        // Palabras clave más amplias para mejor inferencia
        if (nombreLower.includes('capacit') || nombreLower.includes('curso') || nombreLower.includes('taller') || 
            nombreLower.includes('enseñanza') || nombreLower.includes('enseñar') || nombreLower.includes('aprendizaje') ||
            nombreLower.includes('formación') || nombreLower.includes('formacion') || nombreLower.includes('educación') ||
            nombreLower.includes('educacion') || nombreLower.includes('seminario') || nombreLower.includes('workshop')) {
          console.log(`✅ [INFERENCIA] "${nombre}" → "Capacitación"`);
          return 'Capacitación';
        } else if (nombreLower.includes('entrega') || nombreLower.includes('donación') || nombreLower.includes('donacion') ||
                   nombreLower.includes('donar') || nombreLower.includes('regalo') || nombreLower.includes('obsequio') ||
                   nombreLower.includes('distribución') || nombreLower.includes('distribucion') || nombreLower.includes('reparto') ||
                   nombreLower.includes('materiales') || nombreLower.includes('material')) {
          console.log(`✅ [INFERENCIA] "${nombre}" → "Entrega"`);
          return 'Entrega';
        } else if (nombreLower.includes('proyecto') || nombreLower.includes('ayuda') || nombreLower.includes('asistencia') ||
                   nombreLower.includes('apoyo') || nombreLower.includes('beneficio') || nombreLower.includes('social') ||
                   nombreLower.includes('comunidad') || nombreLower.includes('desarrollo') || nombreLower.includes('mejora') ||
                   nombreLower.includes('sistema') || nombreLower.includes('riego') || nombreLower.includes('infraestructura') ||
                   nombreLower.includes('construcción') || nombreLower.includes('construccion') || nombreLower.includes('instalación') ||
                   nombreLower.includes('instalacion') || nombreLower.includes('equipamiento') || nombreLower.includes('tecnología') ||
                   nombreLower.includes('tecnologia') || nombreLower.includes('miniriego') || nombreLower.includes('mini-riego')) {
          console.log(`✅ [INFERENCIA] "${nombre}" → "Proyecto de Ayuda"`);
          return 'Proyecto de Ayuda';
        }
        console.log(`❌ [INFERENCIA] "${nombre}" → No se pudo inferir`);
        return null;
      };
      
      // Filtrar por tipo, considerando diferentes campos posibles
      const filtrados = all.filter(p => {
        // PRIORIDAD 1: categoryKey tiene la máxima prioridad porque es la clave de categoría exacta
        // Si el proyecto tiene categoryKey válido (no 'sin-tipo'), usarlo directamente para comparar
        const categoryKeyNormalizado = p.categoryKey ? String(p.categoryKey).toLowerCase().trim() : null;
        const tipoNormalizadoSolicitado = tipo.toLowerCase().trim();
        
        if (categoryKeyNormalizado && categoryKeyNormalizado !== 'sin-tipo' && categoryKeyNormalizado !== 'sin tipo') {
          // Si categoryKey es válido y coincide, incluir
          if (categoryKeyNormalizado === tipoNormalizadoSolicitado) {
            console.log(`✅ Proyecto ${p.id} (${p.nombre || p.name}) incluido por categoryKey: ${categoryKeyNormalizado}`);
            return true;
          } else {
            // Si categoryKey existe pero no coincide, excluir
            console.log(`❌ Proyecto ${p.id} (${p.nombre || p.name}) excluido: categoryKey "${categoryKeyNormalizado}" no coincide con "${tipoNormalizadoSolicitado}"`);
            return false;
          }
        }
        
        // PRIORIDAD 2: Buscar en otros campos si no hay categoryKey válido
        let proyectoTipo = p.tipo || p.type || p.category;
        
        // Si no tiene tipo o el tipo es inválido, intentar inferir desde el nombre
        const proyectoTipoStr = proyectoTipo ? String(proyectoTipo).toLowerCase().trim() : '';
        const esTipoInvalido = !proyectoTipo || proyectoTipoStr === '' || 
                               proyectoTipoStr === 'n/a' || 
                               proyectoTipoStr === 'sin-tipo' || 
                               proyectoTipoStr === 'sin tipo';
        
        if (esTipoInvalido) {
          // Intentar inferir desde el nombre del proyecto
          const nombreProyecto = p.nombre || p.name;
          const tipoInferido = inferirCategoriaDesdeNombre(nombreProyecto);
          if (tipoInferido) {
            proyectoTipo = tipoInferido;
            console.log(`✅ Proyecto ${p.id} (${nombreProyecto}) - Tipo inferido desde nombre: "${tipoInferido}"`);
            // Si se infirió correctamente, también actualizar el categoryKey en el proyecto (solo en memoria para este filtrado)
            // Esto no guarda en IndexedDB, solo ayuda con el filtrado
          } else {
            // No se puede inferir desde el nombre
            // Si el tipo solicitado es "proyectos-ayuda", incluir proyectos sin tipo como fallback
            // (muchos proyectos pueden ser de ayuda pero no tener palabras clave obvias)
            if (tipoNormalizadoSolicitado === 'proyectos-ayuda') {
              console.log(`✅ Proyecto ${p.id} (${nombreProyecto}) - Incluido en "proyectos-ayuda" como fallback (sin tipo)`);
              return true;
            }
            // Para otras categorías, excluir si no se puede inferir
            console.log(`❌ Proyecto ${p.id} (${nombreProyecto}) excluido: No se puede inferir tipo desde nombre y no es fallback`);
            return false;
          }
        }
        
        // Verificar si el tipo es un UUID (ID de tipo en lugar del nombre)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const esUUID = uuidRegex.test(String(proyectoTipo));
        
        // Si es un UUID, intentar obtener el nombre desde IndexedDB si está disponible
        if (esUUID) {
          // Si tiene tipo_id, intentar obtener el nombre del tipo desde IndexedDB
          const tipoId = p.tipo_id || proyectoTipo;
          
          // Intentar obtener el nombre del tipo desde el store de tipos_actividad
          // (esto se hace de forma síncrona aquí, pero si no está disponible, se excluye)
          // Nota: Esto requiere que los tipos de actividad estén sincronizados en IndexedDB
          // Por ahora, si es UUID y no tiene categoryKey, lo excluimos
          // (pero ya verificamos categoryKey arriba, así que si llegamos aquí es porque no coincide)
          console.warn(`⚠️ Proyecto ${p.id} tiene tipo como UUID (${proyectoTipo}) pero categoryKey no coincide. Necesita sincronización.`);
          return false;
        }
        
        // Normalizar tipos (usar tipoNormalizadoSolicitado que ya está declarado arriba)
        let proyectoTipoOriginal = String(proyectoTipo);
        let proyectoTipoNormalizado = proyectoTipoOriginal.toLowerCase().trim();
        
        // Si el tipo del proyecto es un nombre del servidor (ej: "capacitación"), convertirlo a clave de categoría
        if (tipoToCategoryKey[proyectoTipoNormalizado]) {
          const categoryKeyAnterior = proyectoTipoNormalizado;
          proyectoTipoNormalizado = tipoToCategoryKey[proyectoTipoNormalizado];
          console.log(`🔄 Proyecto ${p.id} (${p.nombre || p.name}) - Tipo convertido: "${categoryKeyAnterior}" → "${proyectoTipoNormalizado}"`);
        }
        
        // Verificar coincidencia exacta (esto funciona si categoryKey está guardado correctamente)
        if (proyectoTipoNormalizado === tipoNormalizadoSolicitado) {
          console.log(`✅ Proyecto ${p.id} (${p.nombre || p.name}) incluido por coincidencia exacta: "${proyectoTipoNormalizado}" === "${tipoNormalizadoSolicitado}"`);
          return true;
        }
        
        // Verificar si el tipo del proyecto coincide con alguno de los valores del mapeo
        const valoresTipo = tipoMap[tipoNormalizadoSolicitado] || [];
        let coincide = valoresTipo.some(valor => {
          const valorNormalizado = valor.toLowerCase().trim();
          // Comparación más flexible: verificar si contiene la palabra clave
          const contienePalabraClave = 
            proyectoTipoNormalizado === valorNormalizado || 
            proyectoTipoNormalizado.includes(valorNormalizado) ||
            valorNormalizado.includes(proyectoTipoNormalizado);
          
          return contienePalabraClave;
        });
        
        // Si no coincide con el mapeo, verificar directamente por palabras clave (case-insensitive)
        if (!coincide) {
          const proyectoTipoLower = proyectoTipoOriginal.toLowerCase();
          
          // Para "Capacitación" -> "capacitaciones"
          if (tipoNormalizadoSolicitado === 'capacitaciones' && (proyectoTipoLower.includes('capacit'))) {
            coincide = true;
            console.log(`✅ Proyecto ${p.id} (${p.nombre || p.name}) incluido por palabra clave "capacit"`);
          }
          // Para "Entrega" -> "entregas"
          else if (tipoNormalizadoSolicitado === 'entregas' && (proyectoTipoLower.includes('entreg'))) {
            coincide = true;
            console.log(`✅ Proyecto ${p.id} (${p.nombre || p.name}) incluido por palabra clave "entreg"`);
          }
          // Para "Proyecto de Ayuda" -> "proyectos-ayuda"
          else if (tipoNormalizadoSolicitado === 'proyectos-ayuda' && (proyectoTipoLower.includes('proyecto') || proyectoTipoLower.includes('ayuda'))) {
            coincide = true;
            console.log(`✅ Proyecto ${p.id} (${p.nombre || p.name}) incluido por palabra clave "proyecto/ayuda"`);
          }
        }
        
        if (!coincide) {
          console.log(`❌ Proyecto ${p.id} (${p.nombre || p.name}) excluido: tipo "${proyectoTipoOriginal}" no coincide con "${tipoNormalizadoSolicitado}"`);
          console.log(`   Detalles: tipo="${p.tipo || 'N/A'}", type="${p.type || 'N/A'}", categoryKey="${p.categoryKey || 'N/A'}"`);
        }
        
        return coincide;
      });
      
      console.log(`🔍 getAllProyectos: Proyectos filtrados para tipo "${tipo}": ${filtrados.length} de ${all.length} totales`);
      
      // Mostrar detalles de TODOS los proyectos para debugging
      if (all.length > 0) {
        console.log(`📋 Detalles de TODOS los proyectos en IndexedDB:`);
        all.forEach((p, index) => {
          const estaIncluido = filtrados.some(f => f.id === p.id);
          console.log(`  ${estaIncluido ? '✅' : '❌'} Proyecto ${index + 1}/${all.length}:`, {
            id: p.id,
            nombre: p.nombre || p.name,
            tipo: p.tipo || 'N/A',
            type: p.type || 'N/A',
            categoryKey: p.categoryKey || 'N/A',
            category: p.category || 'N/A',
            incluido: estaIncluido
          });
        });
      }
      
      if (filtrados.length === 0 && all.length > 0) {
        // Mostrar qué tipos tienen los proyectos para debugging
        const tiposEncontrados = [...new Set(all.map(p => 
          p.tipo || p.type || p.categoryKey || p.category || 'sin-tipo'
        ))];
        console.log(`ℹ️ Tipos disponibles en IndexedDB:`, tiposEncontrados);
      }
      
      return filtrados;
    }
    return all;
  }

  async getProyectosByEstado(estado) {
    return this.getAll(STORES.PROYECTOS, 'estado', estado);
  }

  async getProyectosModificadosOffline() {
    const all = await this.getAll(STORES.PROYECTOS);
    return all.filter(p => p.modificado_offline === true);
  }

  // =====================================================
  // MÉTODOS ESPECÍFICOS PARA COMUNIDADES
  // =====================================================

  async saveComunidad(comunidad) {
    const data = {
      ...comunidad,
      saved_at: new Date().toISOString(),
      is_offline: true,
    };
    return this.put(STORES.COMUNIDADES, data);
  }

  async getComunidad(id) {
    return this.get(STORES.COMUNIDADES, id);
  }

  async getAllComunidades(regionId = null) {
    if (regionId) {
      return this.getAll(STORES.COMUNIDADES, 'region_id', regionId);
    }
    return this.getAll(STORES.COMUNIDADES);
  }

  async searchComunidades(query) {
    const all = await this.getAll(STORES.COMUNIDADES);
    const lowerQuery = query.toLowerCase();
    return all.filter(c => 
      c.nombre?.toLowerCase().includes(lowerQuery) ||
      c.codigo?.toLowerCase().includes(lowerQuery)
    );
  }

  // =====================================================
  // MÉTODOS ESPECÍFICOS PARA REGIONES
  // =====================================================

  async saveRegion(region) {
    const data = {
      ...region,
      saved_at: new Date().toISOString(),
      is_offline: true,
    };
    return this.put(STORES.REGIONES, data);
  }

  async getRegion(id) {
    return this.get(STORES.REGIONES, id);
  }

  async getAllRegiones() {
    return this.getAll(STORES.REGIONES);
  }

  // =====================================================
  // MÉTODOS ESPECÍFICOS PARA BENEFICIARIOS
  // =====================================================

  async saveBeneficiario(beneficiario) {
    const data = {
      ...beneficiario,
      saved_at: new Date().toISOString(),
      is_offline: true,
    };
    return this.put(STORES.BENEFICIARIOS, data);
  }

  async getBeneficiario(id) {
    return this.get(STORES.BENEFICIARIOS, id);
  }

  async getAllBeneficiarios(comunidadId = null) {
    if (comunidadId) {
      return this.getAll(STORES.BENEFICIARIOS, 'comunidad_id', comunidadId);
    }
    return this.getAll(STORES.BENEFICIARIOS);
  }

  async searchBeneficiarios(query) {
    const all = await this.getAll(STORES.BENEFICIARIOS);
    const lowerQuery = query.toLowerCase();
    return all.filter(b => {
      const detalles = b.detalles || {};
      const nombre = (b.nombre || detalles.nombre || detalles.display_name || '').toLowerCase();
      const dpi = (b.dpi || detalles.dpi || '').toString().toLowerCase();
      const displayName = (detalles.display_name || b.nombre || '').toLowerCase();
      return nombre.includes(lowerQuery) || 
             dpi.includes(lowerQuery) || 
             displayName.includes(lowerQuery);
    });
  }

  // =====================================================
  // MÉTODOS DE UTILIDAD
  // =====================================================

  async clearStore(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStats() {
    const stats = {};
    for (const storeName of Object.values(STORES)) {
      stats[storeName] = await this.count(storeName);
    }
    return stats;
  }
}

// Instancia global
const offlineDB = new OfflineDB();

// Inicializar cuando el DOM esté listo
if (typeof window !== 'undefined') {
  console.log('🔍 [OFFLINE-DB] Inicializando IndexedDB...');
  console.log('🔍 [OFFLINE-DB] document.readyState:', document.readyState);
  console.log('🔍 [OFFLINE-DB] indexedDB disponible:', !!window.indexedDB);
  
  // Verificar que IndexedDB esté disponible
  if (!window.indexedDB) {
    console.error('❌ [OFFLINE-DB] IndexedDB no está disponible en este navegador');
  } else {
    // Inicializar inmediatamente si es posible
    offlineDB.init().then(() => {
      console.log('✅ [OFFLINE-DB] IndexedDB inicializado correctamente (inmediato)');
      window.OfflineDB = offlineDB;
    }).catch(error => {
      console.error('❌ [OFFLINE-DB] Error al inicializar IndexedDB (inmediato):', error);
    });

    // También inicializar cuando el DOM esté listo (por si acaso)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', async () => {
        console.log('🔍 [OFFLINE-DB] DOM cargado, inicializando IndexedDB...');
        try {
          await offlineDB.init();
          console.log('✅ [OFFLINE-DB] IndexedDB inicializado correctamente (DOMContentLoaded)');
          window.OfflineDB = offlineDB;
        } catch (error) {
          console.error('❌ [OFFLINE-DB] Error al inicializar IndexedDB (DOMContentLoaded):', error);
        }
      });
    } else {
      // DOM ya está listo
      console.log('🔍 [OFFLINE-DB] DOM ya está listo, inicializando IndexedDB...');
      offlineDB.init().then(() => {
        console.log('✅ [OFFLINE-DB] IndexedDB inicializado correctamente (DOM listo)');
        window.OfflineDB = offlineDB;
      }).catch(error => {
        console.error('❌ [OFFLINE-DB] Error al inicializar IndexedDB (DOM listo):', error);
      });
    }

    // Exponer globalmente inmediatamente (aunque aún no esté inicializado)
    window.OfflineDB = offlineDB;
  }
}

// Exportar para uso en otros módulos (si se usa módulos)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OfflineDB, offlineDB, STORES };
}

