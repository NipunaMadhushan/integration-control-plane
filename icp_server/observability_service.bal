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

import icp_server.types as types;

import ballerina/http;
import ballerina/log;
import icp_server.utils;
import icp_server.storage;

// HTTP client for OpenSearch with SSL verification disabled
final http:Client observabilityBackendClient = check new (observabilityBackendUrl,
    secureSocket = {
        cert: {
            path: truststorePath,
            password: truststorePassword
        }
    }
);

@http:ServiceConfig {
    auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: defaultJwtHMACSecret
                    }
                }
            }
        ],
    cors: {
        allowOrigins: ["http://localhost:3000", "https://localhost:3000"],
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /icp/observability on httpListener {
    
    resource function post logs(http:Request request, types:LogEntryRequest logRequest) returns types:LogEntriesResponse|http:Ok|http:InternalServerError|error {

        // Get authorization header
        string|http:HeaderNotFoundError authHeader = request.getHeader("Authorization");
        if authHeader is http:HeaderNotFoundError {
            return error("Authorization header is required for fetching logs");
        }
        
        // Extract user context for RBAC
        types:UserContext userContext = check utils:extractUserContext(authHeader);

        // Validate and filter log request based on user access
        types:LogEntryRequest validatedLogRequest = check getUserValidatedLogRequest(logRequest, userContext);

        http:Response|error response = observabilityBackendClient->post("/logs", validatedLogRequest, {
            "X-API-Key": observabilityBackendApiKey
        });

        if response is error {
            log:printError("Error calling authentication backend", response);
            return utils:createInternalServerError("Authentication service unavailable");
        }

        // Check status code before parsing response
        if response.statusCode != http:STATUS_CREATED {
            log:printError("Unexpected status code from observability backend", statusCode = response.statusCode);
            json|error errorPayload = response.getJsonPayload();
            if errorPayload is error {
                log:printError("Error parsing error payload from observability backend", errorPayload);
                return utils:createInternalServerError("Invalid response from observability service");
            } else {
                log:printError("Observability backend error payload: " + errorPayload.toJsonString());
            }

            return utils:createInternalServerError("Observability service error");
        }

        // Parse response body
        types:LogEntriesResponse|error payload = (check response.getJsonPayload()).cloneWithType(types:LogEntriesResponse);
        if payload is error {
            log:printError("JSON payload not present in observability response", payload);
            return utils:createInternalServerError("Invalid response from observability service");
        }

        return payload;
    }
}

isolated function getUserValidatedLogRequest(types:LogEntryRequest logRequest, types:UserContext userContext) returns types:LogEntryRequest|error {
    types:LogEntryRequest filteredRequest = logRequest;

    if !userContext.isSuperAdmin {
        // Get accessible environments and projects for the user
        string[]|error accessibleProjects = getAccessibleProjects(userContext);
        string[]|error accessibleEnvironments = getAccessibleEnvironments(userContext);

        if accessibleProjects is error {
            log:printError("Error fetching accessible projects for user", accessibleProjects);
            return error("Failed to validate user access for projects");
        }
        if accessibleEnvironments is error {
            log:printError("Error fetching accessible environments for user", accessibleEnvironments);
            return error("Failed to validate user access for environments");
        }

        if filteredRequest.project is string|string[] {
            if filteredRequest.project is string {
                if accessibleProjects.indexOf(<string> filteredRequest.project) is () {
                    log:printError("User does not have access to the specified project: " + <string> filteredRequest.project);
                    filteredRequest.project = ();
                }
            } else {
                string[] filteredProjects = [];
                foreach string proj in <string[]> filteredRequest.project {
                    if accessibleProjects.indexOf(proj) is () {
                        log:printError("User does not have access to the specified project: " + proj);  
                    } else {
                        filteredProjects.push(proj);
                    }
                }
                if filteredProjects.length() == 0 {
                    filteredRequest.project = ();
                } else {
                    filteredRequest.project = filteredProjects;
                }
            }
        } else {
            // If no project is specified, set accessible projects
            filteredRequest.project = accessibleProjects;
        }

        if filteredRequest.environment is () {
            // If no environment is specified, set accessible environments
            filteredRequest.environment = accessibleEnvironments;
        } else {
            if filteredRequest.environment is string {
                if accessibleEnvironments.indexOf(<string> filteredRequest.environment) is () {
                    log:printError("User does not have access to the specified environment: " + <string> filteredRequest.environment);
                    filteredRequest.environment = ();
                }
            } else {
                string[] filteredEnvs = [];
                foreach string env in <string[]> filteredRequest.environment {
                    if accessibleEnvironments.indexOf(env) is () {
                        log:printError("User does not have access to the specified environment: " + env);  
                    } else {
                        filteredEnvs.push(env);
                    }
                }
                if filteredEnvs.length() == 0 {
                    filteredRequest.environment = ();
                } else {
                    filteredRequest.environment = filteredEnvs;
                }
            }
        }
    }

    return filteredRequest;
}


isolated function getAccessibleEnvironments(types:UserContext userContext) returns string[]|error {
    return from string envId in (
        from string projectId in utils:getAccessibleProjectIds(userContext)
        from string envId in utils:getAccessibleEnvironmentIds(userContext, projectId)
        select envId
    )
    select (check storage:getEnvironmentById(envId)).name;
}

isolated function getAccessibleProjects(types:UserContext userContext) returns string[]|error {
    return utils:getAccessibleProjectIds(userContext)
        .map(projectId => (check storage:getProjectById(projectId)).name);
}
