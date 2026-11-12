
 // Carga las variables de entorno definidas en el archivo .env
import 'dotenv/config';

// Importa McpServer para crear y configurar el servidor MCP
import { McpServer } from '@modelcontextprotocol/server';

// Importa serveStdio para permitir la comunicación del servidor
// mediante la entrada y salida estándar (STDIO)
import { serveStdio } from '@modelcontextprotocol/server/stdio';

// Importa createClient para conectarse e interactuar con Supabase
import { createClient } from '@supabase/supabase-js';

// Importa Zod para validar los datos que recibe el servidor
import * as z from 'zod/v4';

// Obtiene las credenciales de conexión a Supabase desde el archivo .env
const { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY } = process.env;

// Verifica que las variables de entorno estén configuradas
// Si falta alguna, muestra un mensaje y detiene la ejecución del programa
if (!EXPO_PUBLIC_SUPABASE_URL || !EXPO_PUBLIC_SUPABASE_KEY) {
    console.error('Revisa las variables del archivo .env');
    process.exit(1);
}

// Crea el cliente de Supabase utilizando la URL y la clave de acceso
// Este cliente permitirá realizar consultas y operaciones en la base de datos
const supabase = createClient(
    EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_KEY
);

// Define los posibles estados que puede tener un registro o tarea
const estados = ['pendiente', 'en_progreso', 'completada'];

// Define una función llamada exito que recibe datos y los devuelve
// en el formato de respuesta que utiliza MCP
const exito = (datos) => ({
    content: [
        {
            type: 'text',
            // Convierte los datos a texto JSON con formato legible
            // El null indica que no se reemplazarán propiedades
            // El 2 establece una indentación de dos espacios
            text: JSON.stringify(datos, null, 2)
        }
    ]
});

function crearServidor() {
    const server = new McpServer({
        name: 'taller-supabase',
        version: '1.0.0'
    });

    // HERRAMIENTA 1: LISTAR TAREAS

    // Registra una herramienta para listar las tareas de Supabase
    server.registerTool('listar_tareas', {
        description: 'Lista tareas de Supabase; filtra por estado',
        inputSchema: z.object({
            estado: z.enum(estados).optional(),
            limite: z.number().int().min(1).max(30).default(10)
        })
    }, async ({ estado, limite }) => {

        // Consulta la tabla tareas_mcp y selecciona los campos indicados
        // Ordena los resultados por ID y limita la cantidad de registros
        let consulta = supabase.from('tareas_mcp')
            .select('id,titulo,estado')
            .order('id')
            .limit(limite);

        // Si se recibe un estado, filtra las tareas por ese estado
        if (estado) consulta = consulta.eq('estado', estado);

        // Ejecuta la consulta en Supabase
        const { data, error } = await consulta;

        // Si ocurre un error, devuelve el mensaje correspondiente
        if (error) return {
            isError: true,
            content: [{ type: 'text', text: error.message }]
        };

        // Devuelve los resultados en formato MCP
        return exito(data);
    });

    // HERRAMIENTA 2: BUSCAR TAREAS

    // Registra una herramienta llamada buscar_tareas en el servidor MCP
    server.registerTool('buscar_tareas', {

        // Describe la función de la herramienta
        description: 'Busca tareas por texto dentro del titulo',

        // Define y valida los datos que recibirá la herramienta
        inputSchema: z.object({
            // Recibe un texto obligatorio, elimina espacios al inicio y al final,
            // y establece que debe tener entre 2 y 60 caracteres
            texto: z.string().trim().min(2).max(60)
        })

    // Ejecuta esta función y recibe el texto enviado por el usuario
    }, async ({ texto }) => {

        // Consulta la tabla tareas_mcp de Supabase
        const { data, error } = await supabase
            .from('tareas_mcp')

            // Selecciona únicamente los campos ID, título y estado
            .select('id,titulo,estado')

            // Busca coincidencias en el título, sin distinguir mayúsculas y minúsculas
            .ilike('titulo', `%${texto}%`)

            // Ordena los resultados por ID y limita la búsqueda a 20 tareas
            .order('id').limit(20);

        // Si ocurre un error, devuelve el mensaje correspondiente
        if (error) return {
            isError: true,
            content: [{ type: 'text', text: error.message }]
        };

        // Si la consulta es exitosa, devuelve los resultados en formato MCP
        return exito(data);
    });

    // HERRAMIENTA 3: RESUMEN DE TAREAS

    // Registra una herramienta para contar las tareas existentes por estado
    server.registerTool('resumen_tareas', {
        description: 'Cuenta cuántas tareas existen por estado',

        // Esta herramienta no necesita recibir parámetros
        inputSchema: z.object({})
    }, async () => {

        // Crea un arreglo vacío para almacenar los resultados
        const conteos = [];

        // Recorre cada uno de los estados definidos anteriormente
        for (const estado of estados) {

            // Consulta Supabase y cuenta cuántas tareas existen
            // para el estado actual, sin descargar los registros
            const { count, error } = await supabase
                .from('tareas_mcp')
                .select('id', { count: 'exact', head: true })
                .eq('estado', estado);

            // Si ocurre un error, devuelve el mensaje correspondiente
            if (error) return {
                isError: true,
                content: [{ type: 'text', text: error.message }]
            };

            // Guarda el estado y la cantidad de tareas encontradas
            conteos.push({
                estado,
                cantidad: count ?? 0
            });
        }

        // Devuelve el resumen de tareas en formato MCP
        return exito(conteos);
    });

    // Devuelve el servidor configurado
    return server;
}

// Inicia el servidor utilizando el protocolo STDIO
serveStdio(crearServidor);

// Muestra un mensaje en la consola indicando que el servidor está iniciando
console.error('Servidor MCP iniciando (stdio)');
