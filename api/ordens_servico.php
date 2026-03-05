<?php
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

function json_input() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function row_to_payload($row) {
    $dados = json_decode($row['dados_json'], true);
    if (!is_array($dados)) $dados = [];

    $dados['id'] = $row['id'];
    $dados['os_numero'] = $row['os_numero'];
    $dados['cliente'] = $row['cliente'];
    $dados['servico_titulo'] = $row['servico_titulo'];
    $dados['valor_restante'] = $row['valor_restante'];

    if (!isset($dados['status'])) $dados['status'] = [];
    $dados['status']['pago'] = (bool)$row['status_pago'];
    $dados['status']['faturado'] = (bool)$row['status_faturado'];

    $dados['data_criacao'] = $row['data_criacao'];
    $dados['data_atualizacao'] = $row['data_atualizacao'];

    return $dados;
}

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $id = $conn->real_escape_string($_GET['id']);
        $result = $conn->query("SELECT * FROM ordem_servico WHERE id = '$id' LIMIT 1");
        if ($result && $result->num_rows > 0) {
            echo json_encode(row_to_payload($result->fetch_assoc()));
        } else {
            http_response_code(404);
            echo json_encode(['erro' => 'O.S. não encontrada']);
        }
        exit;
    }

    $result = $conn->query('SELECT * FROM ordem_servico ORDER BY data_criacao DESC');
    $lista = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $lista[] = row_to_payload($row);
        }
    }
    echo json_encode($lista);
    exit;
}

if ($method === 'POST' || $method === 'PUT') {
    $body = json_input();
    $id = $body['id'] ?? uniqid('os_', true);

    $os_numero = $conn->real_escape_string($body['os_numero'] ?? '');
    $cliente = $conn->real_escape_string($body['cliente'] ?? '');
    $servico_titulo = $conn->real_escape_string($body['servico_titulo'] ?? '');
    $valor_restante = $conn->real_escape_string($body['valor_restante'] ?? '');

    $status_pago = !empty($body['status']['pago']) ? 1 : 0;
    $status_faturado = !empty($body['status']['faturado']) ? 1 : 0;

    $agora = date('Y-m-d H:i:s');
    $data_criacao = $body['data_criacao'] ?? $agora;
    $data_atualizacao = $agora;

    $idEsc = $conn->real_escape_string($id);
    $dataCriacaoEsc = $conn->real_escape_string($data_criacao);
    $dataAtualizacaoEsc = $conn->real_escape_string($data_atualizacao);
    $dadosJson = $conn->real_escape_string(json_encode($body, JSON_UNESCAPED_UNICODE));

    $sql = "INSERT INTO ordem_servico (id, os_numero, cliente, servico_titulo, valor_restante, status_pago, status_faturado, data_criacao, data_atualizacao, dados_json)
            VALUES ('$idEsc', '$os_numero', '$cliente', '$servico_titulo', '$valor_restante', $status_pago, $status_faturado, '$dataCriacaoEsc', '$dataAtualizacaoEsc', '$dadosJson')
            ON DUPLICATE KEY UPDATE
                os_numero = VALUES(os_numero),
                cliente = VALUES(cliente),
                servico_titulo = VALUES(servico_titulo),
                valor_restante = VALUES(valor_restante),
                status_pago = VALUES(status_pago),
                status_faturado = VALUES(status_faturado),
                data_atualizacao = VALUES(data_atualizacao),
                dados_json = VALUES(dados_json)";

    if ($conn->query($sql)) {
        echo json_encode(['ok' => true, 'id' => $id]);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => $conn->error]);
    }
    exit;
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erro' => 'ID obrigatório']);
        exit;
    }

    $idEsc = $conn->real_escape_string($id);
    if ($conn->query("DELETE FROM ordem_servico WHERE id = '$idEsc'")) {
        echo json_encode(['ok' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => $conn->error]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['erro' => 'Método não permitido']);
