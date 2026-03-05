const API = './api/firestore_compat.php';

function encodeWhere(wheres = []) {
  return encodeURIComponent(JSON.stringify(wheres));
}

async function apiGet(params = {}) {
  const url = new URL(API, window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function apiWrite(method, payload = {}, params = {}) {
  const url = new URL(API, window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const resp = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: Object.keys(payload).length ? JSON.stringify(payload) : undefined
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.erro || `HTTP ${resp.status}`);
  return json;
}

function wrapDoc(item) {
  return {
    id: item.id,
    data: () => item.data || {},
    exists: () => !!item.exists
  };
}

function wrapQuerySnapshot(items) {
  const docs = items.map(item => ({ id: item.id, data: () => item.data || {} }));
  return {
    docs,
    forEach: (cb) => docs.forEach(cb)
  };
}

export const db = {};

export function collection(_db, name) {
  return { type: 'collection', name };
}

export function doc(_dbOrCollection, nameOrId, maybeId) {
  if (typeof maybeId === 'undefined') {
    return { type: 'doc', collection: _dbOrCollection?.name, id: nameOrId };
  }
  return { type: 'doc', collection: nameOrId, id: maybeId };
}

export function query(collectionRef, ...clauses) {
  return { type: 'query', collection: collectionRef.name, clauses };
}

export function where(field, op, value) {
  return { kind: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { kind: 'orderBy', field, direction };
}

export function limit(value) {
  return { kind: 'limit', value };
}

export function serverTimestamp() {
  return { __server_timestamp: true };
}

export async function addDoc(collectionRef, data) {
  const json = await apiWrite('POST', { collection: collectionRef.name, data });
  return { id: json.id };
}

export async function setDoc(docRef, data, options = {}) {
  return apiWrite('PUT', {
    collection: docRef.collection,
    id: docRef.id,
    data,
    merge: !!options.merge
  });
}

export async function updateDoc(docRef, data) {
  return apiWrite('PATCH', { collection: docRef.collection, id: docRef.id, data });
}

export async function deleteDoc(docRef) {
  return apiWrite('DELETE', {}, { collection: docRef.collection, id: docRef.id });
}

export async function getDoc(docRef) {
  const json = await apiGet({ collection: docRef.collection, id: docRef.id });
  return wrapDoc(json);
}

export async function getDocs(targetRef) {
  if (targetRef.type === 'collection') {
    const json = await apiGet({ collection: targetRef.name });
    return wrapQuerySnapshot(json.items || []);
  }
  const wheres = targetRef.clauses.filter(c => c.kind === 'where');
  const order = targetRef.clauses.find(c => c.kind === 'orderBy');
  const lim = targetRef.clauses.find(c => c.kind === 'limit');
  const json = await apiGet({
    collection: targetRef.collection,
    where: encodeWhere(wheres),
    orderBy: order?.field,
    orderDir: order?.direction,
    limit: lim?.value
  });
  return wrapQuerySnapshot(json.items || []);
}

export function onSnapshot(targetRef, callback) {
  let active = true;

  const run = async () => {
    if (!active) return;
    try {
      if (targetRef.type === 'doc') {
        const snap = await getDoc(targetRef);
        callback(snap);
      } else {
        const snap = await getDocs(targetRef);
        callback(snap);
      }
    } catch (e) {
      console.error('onSnapshot polling error:', e);
    }
  };

  run();
  const timer = setInterval(run, 3000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}
