<?php
header('Content-Type: application/json; charset=utf-8');

$host = getenv('DB_HOST') ?: 'localhost';
$usuario = getenv('DB_USER') ?: 'artesynal';
$senha = getenv('DB_PASS') ?: '';
$banco = getenv('DB_NAME') ?: 'artesynal';

$conn = new mysqli($host, $usuario, $senha, $banco);
$conn->set_charset('utf8mb4');

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['erro' => 'Falha na conexão: ' . $conn->connect_error]);
    exit;
}

$conn->query(
    "CREATE TABLE IF NOT EXISTS ordem_servico (
        id VARCHAR(64) PRIMARY KEY,
        os_numero VARCHAR(100) NULL,
        cliente VARCHAR(255) NULL,
        servico_titulo VARCHAR(255) NULL,
        valor_restante VARCHAR(100) NULL,
        status_pago TINYINT(1) DEFAULT 0,
        status_faturado TINYINT(1) DEFAULT 0,
        data_criacao DATETIME NULL,
        data_atualizacao DATETIME NULL,
        dados_json LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);

$conn->query(
    "CREATE TABLE IF NOT EXISTS documents (
        collection_name VARCHAR(100) NOT NULL,
        id VARCHAR(100) NOT NULL,
        data_json LONGTEXT NOT NULL,
        created_at DATETIME NULL,
        updated_at DATETIME NULL,
        PRIMARY KEY (collection_name, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);
