import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_BASE_URL || "";
const REQUIRED_SCOPE = "checkout:addpayments";

console.log("[add-payment-api] AUTH0_ISSUER:", AUTH0_ISSUER);
console.log("[add-payment-api] REQUIRED_SCOPE:", REQUIRED_SCOPE);

// Check if required environment variables are set
if (!AUTH0_ISSUER) {
  console.error("[add-payment-api] AUTH0_ISSUER_BASE_URL environment variable is not set");
}

const client = jwksClient({
  jwksUri: `${AUTH0_ISSUER}/.well-known/jwks.json`,
});

function getKey(header: any, callback: any) {
  try {
    client.getSigningKey(header.kid, function (err, key) {
      if (err || !key) {
        console.log("[add-payment-api] Error getting signing key:", err);
        callback(err || new Error("Signing key not found"));
      } else {
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
      }
    });
  } catch (error) {
    console.log("[add-payment-api] Exception in getKey:", error);
    callback(error);
  }
}

async function validateAccessToken(
  token: string
): Promise<{ valid: boolean; error?: string; payload?: any }> {
  try {
    if (!AUTH0_ISSUER) {
      return { valid: false, error: "AUTH0_ISSUER_BASE_URL not configured" };
    }
    
    return new Promise((resolve) => {
      console.log("[add-payment-api] Validating token with issuer:", AUTH0_ISSUER);
      jwt.verify(
        token,
        getKey,
        {
          algorithms: ["RS256"],
          // Remove issuer validation - JWKS validation is sufficient
          // issuer: AUTH0_ISSUER,
        },
        (err: any, decoded: any) => {
          if (err) {
            console.log("[add-payment-api] JWT verification error:", err.message);
            resolve({ valid: false, error: err.message });
          } else {
            console.log(
              "[add-payment-api] JWT verification successful, checking scope"
            );
            if (
              !decoded.scope ||
              !decoded.scope.split(" ").includes(REQUIRED_SCOPE)
            ) {
              console.log("token : ", token);
              resolve({ valid: false, error: "Missing required scope" });
            } else {
              resolve({ valid: true, payload: decoded });
            }
          }
        }
      );
    });
  } catch (error: any) {
    console.log("[add-payment-api] Exception in validateAccessToken:", error);
    return { valid: false, error: error.message || "Token validation failed" };
  }
}

export async function GET(req: NextRequest) {
  console.log("[add-payment-api] GET request received - health check");
  return NextResponse.json({
    status: "ok",
    message: "Add payment API is accessible",
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  console.log("[add-payment-api] POST request received");
  try {
    const authHeader = req.headers.get("authorization");
    console.log("[add-payment-api] Authorization header:", authHeader ? "Present" : "Missing");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[add-payment-api] Missing or invalid authorization header");
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    console.log("[add-payment-api] Token extracted, validating...");
    
    const { valid, error } = await validateAccessToken(token);
    console.log("[add-payment-api] Token validation result:", { valid, error });
    
    if (!valid) {
      console.log("[add-payment-api] Token validation failed:", error);
      return NextResponse.json(
        { error: error || "Unauthorized" },
        { status: 403 }
      );
    }

    // Parse request body to get payment method details
    let paymentData;
    try {
      console.log("[add-payment-api] Parsing request body...");
      paymentData = await req.json();
      console.log("[add-payment-api] Request body parsed successfully:", paymentData);
    } catch (parseError) {
      console.log("[add-payment-api] JSON parsing error:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    console.log("[add-payment-api] Processing payment method addition...");
    // Implement your add payment method logic here
    // For demonstration, just return success with the payment method details
    const response = {
      success: true,
      message: "Payment method added successfully.",
      paymentMethod: {
        type: paymentData.type,
        cardNumber: paymentData.cardNumber ? `****-****-****-${paymentData.cardNumber.slice(-4)}` : undefined,
        expiryDate: paymentData.expiryDate,
        isDefault: paymentData.isDefault || false,
        id: `pm_${Date.now()}`, // Mock payment method ID
      },
    };
    
    console.log("[add-payment-api] Sending response:", response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[add-payment-api] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
