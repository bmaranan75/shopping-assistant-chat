import { NextRequest, NextResponse } from "next/server";
import { getAllProducts, getProductsByCategory, searchProducts, Product } from "../../../lib/product-catalog";

export async function GET(req: NextRequest) {
  console.log("[catalog-api] GET request received");
  
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let products: Product[] = [];

    if (search) {
      console.log(`[catalog-api] Searching products with query: ${search}`);
      products = searchProducts(search);
    } else if (category) {
      console.log(`[catalog-api] Getting products by category: ${category}`);
      products = getProductsByCategory(category);
    } else {
      console.log("[catalog-api] Getting all products");
      products = getAllProducts();
    }

    // Apply pagination
    const total = products.length;
    const paginatedProducts = products.slice(offset, offset + limit);

    // Get unique categories for filter options
    const allProducts = getAllProducts();
    const categories = [...new Set(allProducts.map(p => p.category))].sort();

    const response = {
      success: true,
      products: paginatedProducts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      },
      categories,
      filters: {
        category: category || null,
        search: search || null
      }
    };

    console.log(`[catalog-api] Returning ${paginatedProducts.length} products out of ${total} total`);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error("[catalog-api] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product catalog" },
      { status: 500 }
    );
  }
}

// GET single product by code
export async function POST(req: NextRequest) {
  console.log("[catalog-api] POST request received");
  
  try {
    const { productCode } = await req.json();
    
    if (!productCode) {
      return NextResponse.json(
        { error: "productCode is required" },
        { status: 400 }
      );
    }

    const allProducts = getAllProducts();
    const product = allProducts.find(p => p.id.toLowerCase() === productCode.toLowerCase());

    if (!product) {
      return NextResponse.json(
        { error: `Product not found: ${productCode}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      product
    });

  } catch (error: any) {
    console.error("[catalog-api] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product details" },
      { status: 500 }
    );
  }
}
