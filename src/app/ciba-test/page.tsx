'use client';

import { useState } from 'react';

export default function CIBATestPage() {
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const testCIBA = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/test-ciba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product: 'Test Apple',
          qty: 1
        })
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: 'Network error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            CIBA Authorization Test
          </h1>
          
          <div className="space-y-6">
            <div className="border-l-4 border-blue-400 bg-blue-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    This page helps test CIBA (Client Initiated Backchannel Authentication) flows.
                    You should receive authorization notifications when testing purchases.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded">
              <h3 className="font-medium text-gray-900 mb-2">Test Steps:</h3>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                <li>Make sure you&apos;re logged in first</li>
                <li>Click the test button below</li>
                <li>You should receive an authorization notification</li>
                <li>Approve or deny the request</li>
                <li>Check the results</li>
              </ol>
            </div>

            <div className="space-y-4">
              <button
                onClick={testCIBA}
                disabled={testing}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {testing ? 'Testing CIBA Flow...' : 'Test CIBA Authorization'}
              </button>

              {testResult && (
                <div className={`p-4 rounded border ${
                  testResult.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-medium ${
                    testResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {testResult.success ? '✅ Success' : '❌ Failed'}
                  </h4>
                  <pre className="mt-2 text-sm overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <h4 className="font-medium text-yellow-800 mb-2">Expected CIBA Flow:</h4>
                <ol className="text-sm text-yellow-700 space-y-1">
                  <li>1. CIBA authorization request initiated</li>
                  <li>2. You receive a push notification or prompt</li>
                  <li>3. You approve/deny the authorization</li>
                  <li>4. Purchase proceeds based on your decision</li>
                </ol>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-medium text-gray-900 mb-2">If notifications aren&apos;t working:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Check Auth0 tenant has CIBA enabled</li>
                  <li>• Verify application supports CIBA grant type</li>
                  <li>• Ensure you have Auth0 Guardian app or proper polling setup</li>
                  <li>• Check console logs for error details</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
