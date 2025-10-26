import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Parse the JSON request body
    const requestBody = await request.json();
    
    // Log the incoming JSON request
    console.log('Received JSON request:', JSON.stringify(requestBody, null, 2));
    
    // Prepare the response
    // const response = {
    //   "commands": [
    //     {
    //       "type": "com.okta.telephony.action"
    //     },
    //     {
    //       "value": {
    //         "status": "SUCCESS",
    //         "provider": "VONAGE",
    //         "transactionId": "SM49a8ece2822d44e4adaccd7ed268f954",
    //         "transactionMetadata": "Duration=300ms"
    //       }
    //     }
    //   ]
    // };

    // const response = {
    //    "commands":[
    //       {
    //          "type":"com.okta.telephony.action",
    //          "value":[
    //             {
    //                "status":"SUCCESSFUL",
    //                "provider":"SINCH",
    //                "transactionId":"a2c4779a-3e12-4926-8e56-23e0caae99bc"
    //             }
    //          ]
    //       }
    //    ]
    // };

    // const response = {
    //    "error":[
    //       {
    //          "errorSummary":"Failed to deliver SMS OTP to test.user@okta.com"
    //       },
    //       {
    //          "errorCauses":{
    //             "errorSummary":"Provider could not deliver OTP",
    //             "reason":"The content of the message is not supported",
    //             "location":"South Africa"
    //          }
    //       }
    //    ]
    // };

    const response = {
       "error":[
          {
             "errorSummary":"Failed to deliver SMS OTP to test.user@okta.com",
             "errorCauses":{
                "errorSummary":"Provider could not deliver OTP",
                "reason":"The content of the message is not supported",
                "location":"South Africa"
             }
          }
       ]
    };
    
    // Return the JSON response
    return NextResponse.json(response, { status: 200 });
    
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Invalid JSON request' },
      { status: 400 }
    );
  }
}
