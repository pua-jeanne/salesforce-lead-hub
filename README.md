# Salesforce Lead Hub

A full-stack web application that integrates Salesforce with modern web technologies to provide a centralized workspace for viewing leads, managing private notes, and sharing lead information through Slack.

## Project Overview

Salesforce Lead Hub is a personal technical R&D project developed to explore technologies beyond the Salesforce platform and incorporate AI-assisted development using OpenAI Codex.



The project focuses on full-stack development, cross-system integrations, secure authentication and authorization, automated testing, and continuous integration and deployment.

## Key Features

- Secure authentication and invite-only application access
- Salesforce Lead retrieval through REST API
- Server-side search, filtering, and cursor-based pagination
- Private lead notes with real-time updates and CRUD operations
- User-level data isolation
- Slack notifications through Incoming Webhooks
- Responsive web interface
- Automated testing and CI/CD

## Technology Stack

| Technology              | Purpose                                 |
| ----------------------- | --------------------------------------- |
| Next.js                 | Full-stack web application framework    |
| React                   | User interface                          |
| TypeScript              | Type-safe development                   |
| Tailwind CSS            | UI styling                              |
| Clerk                   | Authentication and user management      |
| Convex                  | Database and reactive backend functions |
| Salesforce REST API     | CRM data integration                    |
| Slack Incoming Webhooks | Notification integration                |
| Vitest                  | Automated testing                       |
| GitHub Actions          | Continuous integration                  |
| Vercel                  | Application hosting and deployment      |
| OpenAI Codex            | AI-assisted development                 |

## System Architecture

The application follows a single-tenant architecture with server-side integrations and clearly defined responsibilities across its connected systems.

- **Next.js:** Application interface, server-side logic, and integration orchestration.
- **Clerk:** User authentication and identity management.
- **Salesforce:** Authoritative source for Lead records.
- **Convex:** Persistent storage and reactive operations for private lead notes.
- **Slack:** User-triggered lead notifications.

Detailed architecture diagrams, integration flows, data models, and architectural decisions are available in the Technical Project Guide.

## Security

Security considerations are incorporated throughout the application:

- Server-side credential management
- Salesforce OAuth 2.0 Client Credentials Flow
- Authenticated and authorized application access
- Backend-enforced note ownership and data isolation
- Input validation and SOQL escaping
- Environment-based configuration

Application credentials and sensitive configuration are excluded from version control.

## Testing and CI/CD

The project includes automated validation to support code quality and maintainability.

- ESLint
- TypeScript type checking
- Vitest automated tests
- GitHub Actions continuous integration
- Vercel preview and production deployments

The latest local validation completed successfully with 33 automated tests passing across three test files. The production build was validated using Webpack.

## AI-Assisted Development

OpenAI Codex was incorporated into the development workflow to support:

- Exploration of unfamiliar technologies
- Feature implementation and debugging
- Code analysis and refactoring
- Automated test development
- Technical documentation
- Security and code quality reviews

AI-assisted development is complemented by engineering judgment, implementation review, and testing.

## Live Application

[Salesforce Lead Hub](https://salesforce-lead-hub.vercel.app)



Application access is restricted. Access may be provided upon request.

## Technical Documentation

The Technical Project Guide provides detailed information on:

- System architecture and integration flows
- Authentication and authorization
- Data modeling and ownership
- Local development and environment configuration
- Testing and deployment
- Architectural decisions and known limitations
- Troubleshooting

## Author

**Pauline Pua**



Salesforce Developer | Full-Stack Development | DevOps



[Salesforce Trailblazer Profile](https://www.salesforce.com/trailblazer/paupua)
