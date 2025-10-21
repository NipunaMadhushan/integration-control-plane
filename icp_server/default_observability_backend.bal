// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/log;
import ballerina/http;
import ballerina/lang.runtime;
import icp_server.observability;

// HTTP service configuration
listener http:Listener observabilityBackendListener = new (defaultObservabilityServicePort,
    config = {
        host: defaultObservabilityServiceHost,
        secureSocket: { 
            key: {
                path: keystorePath,
                password: keystorePassword
            }
        }
    }
);

public function main() returns error? {

    if defaultObservabilityBackend == "opensearch" {
        check observabilityBackendListener.attach(observability:opensearchService, "/");
        check observabilityBackendListener.'start();
        runtime:registerListener(observabilityBackendListener);
        log:printInfo("Observability backend service is running at " + defaultObservabilityServiceHost + ":" + defaultObservabilityServicePort.toString());
    } else {
        log:printInfo("Default observability backend is not set to OpenSearch. Observability service will not start.");
    }
}