// api/testR2.js - Endpoint de diagnóstico para configuración R2
import { S3Client } from "@aws-sdk/client-s3";
import { setCORS, handlePreflight } from "./_lib/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Método no permitido" });
  }

  try {
    // Verificar variables de entorno (sin exponer valores sensibles)
    const envCheck = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ? `...${process.env.R2_ACCOUNT_ID?.slice(-4)}` : "❌ NO CONFIGURADO",
      R2_ACCESS_KEY: process.env.R2_ACCESS_KEY ? `...${process.env.R2_ACCESS_KEY?.slice(-4)}` : "❌ NO CONFIGURADO", 
      R2_SECRET_KEY: process.env.R2_SECRET_KEY ? `...${process.env.R2_SECRET_KEY?.slice(-4)}` : "❌ NO CONFIGURADO",
      R2_BUCKET: process.env.R2_BUCKET || "❌ NO CONFIGURADO",
      R2_DEV_URL: process.env.R2_DEV_URL || "❌ NO CONFIGURADO"
    };

    const requiredVars = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET", "R2_DEV_URL"];
    const missing = requiredVars.filter(v => !process.env[v]);
    const allConfigured = missing.length === 0;

    // Intentar crear el cliente S3 si todas las variables están presentes
    let s3Status = "❌ No se puede crear (variables faltantes)";
    if (allConfigured) {
      try {
        const s3 = new S3Client({
          region: "auto",
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY,
            secretAccessKey: process.env.R2_SECRET_KEY,
          },
        });
        s3Status = "✅ Cliente S3 creado exitosamente";
      } catch (err) {
        s3Status = `❌ Error creando cliente: ${err.message}`;
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      vercel: {
        region: process.env.VERCEL_REGION || "local",
        deployment: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "local"
      },
      r2_config: envCheck,
      status: allConfigured ? "✅ Configuración completa" : "⚠️ Configuración incompleta",
      s3_client: s3Status,
      missing_vars: missing,
      bucket_info: process.env.R2_BUCKET ? {
        bucket_name: process.env.R2_BUCKET,
        public_url: process.env.R2_DEV_URL,
        expected_bucket: "stela",
        is_correct_bucket: process.env.R2_BUCKET === "stela"
      } : null,
      help: {
        message: "Variables faltantes o bucket incorrecto",
        action: "Ejecuta el script: ./scripts/setup-vercel-envs-stela.sh",
        expected_values: {
          R2_BUCKET: "stela",
          R2_DEV_URL: "https://pub-e6e7dd036243444a866947cdd48c1b5a.r2.dev"
        }
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: "Error al verificar configuración R2"
    });
  }
}
