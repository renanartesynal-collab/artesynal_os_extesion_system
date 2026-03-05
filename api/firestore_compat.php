<?php
require_once __DIR__ . '/db.php';

function now_sql() { return date('Y-m-d H:i:s'); }

function decode_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function apply_server_timestamps($value) {
    if (is_array($value)) {
        if (isset($value['__server_timestamp']) && $value['__server_timestamp'] === true) {
            return now_sql();
        }
        $out = [];
        foreach ($value as $k => $v) $out[$k] = apply_server_timestamps($v);
        return $out;
    }
    return $value;
}

function deep_merge($base, $patch) {
    foreach ($patch as $k => $v) {
        if (isset($base[$k]) && is_array($base[$k]) && is_array($v)) {
            $base[$k] = deep_merge($base[$k], $v);
        } else {
            $base[$k] = $v;
        }
    }
    return $base;
}

function read_doc($conn, $collection, $id) {
    $c = $conn->real_escape_string($collection);
    $i = $conn->real_escape_string($id);
    $sql = "SELECT data_json FROM documents WHERE collection_name = '$c' AND id = '$i' LIMIT 1";
    $res = $conn->query($sql);
    if ($res && $res->num_rows > 0) {
        $row = $res->fetch_assoc();
        $data = json_decode($row['data_json'], true);
        return is_array($data) ? $data : [];
    }
    return null;
}

function write_doc($conn, $collection, $id, $data) {
    $c = $conn->real_escape_string($collection);
    $i = $conn->real_escape_string($id);
    $json = $conn->real_escape_string(json_encode($data, JSON_UNESCAPED_UNICODE));
    $now = $conn->real_escape_string(now_sql());

    $sql = "INSERT INTO documents (collection_name, id, data_json, created_at, updated_at)
            VALUES ('$c', '$i', '$json', '$now', '$now')
            ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = VALUES(updated_at)";
    return $conn->query($sql);
}

function normalize_sort_value($v) {
    if (is_bool($v)) return $v ? 1 : 0;
    if (is_numeric($v)) return (float)$v;
    if (is_string($v)) return strtotime($v) ?: strtolower($v);
    return '';
}

$method = $_SERVER['REQUEST_METHOD'];
$collection = $_GET['collection'] ?? null;
$docId = $_GET['id'] ?? null;
$body = decode_json_body();

if (!$collection && isset($body['collection'])) $collection = $body['collection'];
if (!$docId && isset($body['id'])) $docId = $body['id'];

if (!$collection) {
    http_response_code(400);
    echo json_encode(['erro' => 'collection é obrigatório']);
    exit;
}

if ($method === 'GET') {
    if ($docId) {
        $doc = read_doc($conn, $collection, $docId);
        if ($doc === null) {
            echo json_encode(['id' => $docId, 'exists' => false, 'data' => null]);
        } else {
            echo json_encode(['id' => $docId, 'exists' => true, 'data' => $doc]);
        }
        exit;
    }

    $c = $conn->real_escape_string($collection);
    $res = $conn->query("SELECT id, data_json FROM documents WHERE collection_name = '$c'");
    $items = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $data = json_decode($row['data_json'], true);
            $items[] = ['id' => $row['id'], 'data' => is_array($data) ? $data : []];
        }
    }

    if (!empty($_GET['where'])) {
        $wheres = json_decode(urldecode($_GET['where']), true);
        if (is_array($wheres)) {
            $items = array_values(array_filter($items, function($item) use ($wheres) {
                foreach ($wheres as $w) {
                    $field = $w['field'] ?? '';
                    $op = $w['op'] ?? '==';
                    $value = $w['value'] ?? null;
                    $current = $item['data'][$field] ?? null;
                    if ($op === '==' && $current != $value) return false;
                }
                return true;
            }));
        }
    }

    if (!empty($_GET['orderBy'])) {
        $field = $_GET['orderBy'];
        $dir = strtolower($_GET['orderDir'] ?? 'asc');
        usort($items, function($a, $b) use ($field, $dir) {
            $va = normalize_sort_value($a['data'][$field] ?? null);
            $vb = normalize_sort_value($b['data'][$field] ?? null);
            if ($va == $vb) return 0;
            $cmp = $va <=> $vb;
            return $dir === 'desc' ? -$cmp : $cmp;
        });
    }

    if (!empty($_GET['limit'])) {
        $items = array_slice($items, 0, (int)$_GET['limit']);
    }

    echo json_encode(['items' => $items]);
    exit;
}

if ($method === 'POST') {
    $data = apply_server_timestamps($body['data'] ?? []);
    $id = $docId ?: uniqid('doc_', true);
    if (write_doc($conn, $collection, $id, $data)) {
        echo json_encode(['ok' => true, 'id' => $id]);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => $conn->error]);
    }
    exit;
}

if ($method === 'PUT' || $method === 'PATCH') {
    if (!$docId) {
        http_response_code(400);
        echo json_encode(['erro' => 'id é obrigatório']);
        exit;
    }

    $incoming = apply_server_timestamps($body['data'] ?? []);
    $existing = read_doc($conn, $collection, $docId);
    if (!is_array($existing)) $existing = [];

    $merge = ($method === 'PATCH') || !empty($body['merge']);
    $toSave = $merge ? deep_merge($existing, $incoming) : $incoming;

    if (write_doc($conn, $collection, $docId, $toSave)) {
        echo json_encode(['ok' => true, 'id' => $docId]);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => $conn->error]);
    }
    exit;
}

if ($method === 'DELETE') {
    if (!$docId) {
        http_response_code(400);
        echo json_encode(['erro' => 'id é obrigatório']);
        exit;
    }
    $c = $conn->real_escape_string($collection);
    $i = $conn->real_escape_string($docId);
    if ($conn->query("DELETE FROM documents WHERE collection_name = '$c' AND id = '$i'")) {
        echo json_encode(['ok' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => $conn->error]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['erro' => 'Método não permitido']);
