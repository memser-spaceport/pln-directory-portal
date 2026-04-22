# RBAC v2 API Reference

> **Base URL:** `http://localhost:3003/v2`  
> Collapse/expand each `##` section in your IDE to navigate endpoints.

---

## 1) Admin - List policies

### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/policies' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=8Qj4mb7g44bTgqbnKVElIw'

```

### Response

```json
[
    {
        "uid": "cmo65hq7x008u8o01cumfn4lz",
        "code": "advisor_future",
        "name": "Advisor / Future",
        "description": null,
        "role": "Advisor",
        "group": "Future",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.446Z",
        "updatedAt": "2026-04-19T19:20:08.446Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7y008x8o0121wkde13",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.446Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7y008y8o01x3nk5o3u",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.447Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq7z008z8o01db0bxqk0",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.448Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq8000918o01gd5wxa9e",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.448Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq8100928o01e9tqpnn4",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.449Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq8100938o01kthsxng7",
                "policyUid": "cmo65hq7x008u8o01cumfn4lz",
                "permissionUid": "pl.advisors.access",
                "createdAt": "2026-04-19T19:20:08.450Z",
                "permission": {
                    "uid": "pl.advisors.access",
                    "code": "pl.advisors.access",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.221Z",
                    "updatedAt": "2026-04-19T19:20:08.221Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq3200148o012en9me0w",
        "code": "demo_day_admin_pl_internal",
        "name": "Demo Day Admin / PL Internal",
        "description": null,
        "role": "Demo Day Admin",
        "group": "PL Internal",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.270Z",
        "updatedAt": "2026-04-19T19:20:08.270Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq3300168o014pdo54lm",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.272Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq3500178o01pf82a2mf",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.prep.write",
                "createdAt": "2026-04-19T19:20:08.273Z",
                "permission": {
                    "uid": "demoday.prep.write",
                    "code": "demoday.prep.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.206Z",
                    "updatedAt": "2026-04-19T19:20:08.206Z"
                }
            },
            {
                "uid": "cmo65hq3600198o01en6qj3eu",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.showcase.read",
                "createdAt": "2026-04-19T19:20:08.275Z",
                "permission": {
                    "uid": "demoday.showcase.read",
                    "code": "demoday.showcase.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.207Z",
                    "updatedAt": "2026-04-19T19:20:08.207Z"
                }
            },
            {
                "uid": "cmo65hq37001b8o0138cywysw",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.showcase.write",
                "createdAt": "2026-04-19T19:20:08.276Z",
                "permission": {
                    "uid": "demoday.showcase.write",
                    "code": "demoday.showcase.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.210Z",
                    "updatedAt": "2026-04-19T19:20:08.210Z"
                }
            },
            {
                "uid": "cmo65hq39001c8o012dc6rrix",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.277Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq3a001d8o012tbpwfsz",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.active.write",
                "createdAt": "2026-04-19T19:20:08.278Z",
                "permission": {
                    "uid": "demoday.active.write",
                    "code": "demoday.active.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.213Z",
                    "updatedAt": "2026-04-19T19:20:08.213Z"
                }
            },
            {
                "uid": "cmo65hq3b001e8o01d3iak00k",
                "policyUid": "cmo65hq3200148o012en9me0w",
                "permissionUid": "demoday.stats.read",
                "createdAt": "2026-04-19T19:20:08.279Z",
                "permission": {
                    "uid": "demoday.stats.read",
                    "code": "demoday.stats.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.214Z",
                    "updatedAt": "2026-04-19T19:20:08.214Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq3h001n8o017iej9tim",
        "code": "demo_day_admin_pl_partner",
        "name": "Demo Day Admin / PL Partner",
        "description": null,
        "role": "Demo Day Admin",
        "group": "PL Partner",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.286Z",
        "updatedAt": "2026-04-19T19:20:08.286Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq3i001q8o019ajvmgc6",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.287Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq3k001s8o01rsqi87xr",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.prep.write",
                "createdAt": "2026-04-19T19:20:08.288Z",
                "permission": {
                    "uid": "demoday.prep.write",
                    "code": "demoday.prep.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.206Z",
                    "updatedAt": "2026-04-19T19:20:08.206Z"
                }
            },
            {
                "uid": "cmo65hq3l001t8o019j6k3q22",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.showcase.read",
                "createdAt": "2026-04-19T19:20:08.289Z",
                "permission": {
                    "uid": "demoday.showcase.read",
                    "code": "demoday.showcase.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.207Z",
                    "updatedAt": "2026-04-19T19:20:08.207Z"
                }
            },
            {
                "uid": "cmo65hq3m001u8o01euki57vk",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.showcase.write",
                "createdAt": "2026-04-19T19:20:08.290Z",
                "permission": {
                    "uid": "demoday.showcase.write",
                    "code": "demoday.showcase.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.210Z",
                    "updatedAt": "2026-04-19T19:20:08.210Z"
                }
            },
            {
                "uid": "cmo65hq3n001w8o017oex7n42",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.291Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq3o001y8o013umtetzg",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.active.write",
                "createdAt": "2026-04-19T19:20:08.292Z",
                "permission": {
                    "uid": "demoday.active.write",
                    "code": "demoday.active.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.213Z",
                    "updatedAt": "2026-04-19T19:20:08.213Z"
                }
            },
            {
                "uid": "cmo65hq3p00208o01rbfkly95",
                "policyUid": "cmo65hq3h001n8o017iej9tim",
                "permissionUid": "demoday.stats.read",
                "createdAt": "2026-04-19T19:20:08.293Z",
                "permission": {
                    "uid": "demoday.stats.read",
                    "code": "demoday.stats.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.214Z",
                    "updatedAt": "2026-04-19T19:20:08.214Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq3c001f8o016eu95cxi",
        "code": "demo_day_stakeholder_pl_internal",
        "name": "Demo Day Stakeholder / PL Internal",
        "description": null,
        "role": "Demo Day Stakeholder",
        "group": "PL Internal",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.280Z",
        "updatedAt": "2026-04-19T19:20:08.280Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq3d001i8o016usqk47f",
                "policyUid": "cmo65hq3c001f8o016eu95cxi",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.281Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq3e001j8o01409kpmt7",
                "policyUid": "cmo65hq3c001f8o016eu95cxi",
                "permissionUid": "demoday.showcase.read",
                "createdAt": "2026-04-19T19:20:08.282Z",
                "permission": {
                    "uid": "demoday.showcase.read",
                    "code": "demoday.showcase.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.207Z",
                    "updatedAt": "2026-04-19T19:20:08.207Z"
                }
            },
            {
                "uid": "cmo65hq3f001l8o01a6045gkl",
                "policyUid": "cmo65hq3c001f8o016eu95cxi",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.284Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq3g001m8o01lcgdowx3",
                "policyUid": "cmo65hq3c001f8o016eu95cxi",
                "permissionUid": "demoday.stats.read",
                "createdAt": "2026-04-19T19:20:08.285Z",
                "permission": {
                    "uid": "demoday.stats.read",
                    "code": "demoday.stats.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.214Z",
                    "updatedAt": "2026-04-19T19:20:08.214Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq3p00218o01eiapehod",
        "code": "demo_day_stakeholder_pl_partner",
        "name": "Demo Day Stakeholder / PL Partner",
        "description": null,
        "role": "Demo Day Stakeholder",
        "group": "PL Partner",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.294Z",
        "updatedAt": "2026-04-19T19:20:08.294Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq3q00238o0177iqb4e4",
                "policyUid": "cmo65hq3p00218o01eiapehod",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.295Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq3s00248o0156rh7a6q",
                "policyUid": "cmo65hq3p00218o01eiapehod",
                "permissionUid": "demoday.showcase.read",
                "createdAt": "2026-04-19T19:20:08.296Z",
                "permission": {
                    "uid": "demoday.showcase.read",
                    "code": "demoday.showcase.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.207Z",
                    "updatedAt": "2026-04-19T19:20:08.207Z"
                }
            },
            {
                "uid": "cmo65hq3t00268o01tq5wek5u",
                "policyUid": "cmo65hq3p00218o01eiapehod",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.298Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq3u00288o01eioi3ulj",
                "policyUid": "cmo65hq3p00218o01eiapehod",
                "permissionUid": "demoday.stats.read",
                "createdAt": "2026-04-19T19:20:08.299Z",
                "permission": {
                    "uid": "demoday.stats.read",
                    "code": "demoday.stats.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.214Z",
                    "updatedAt": "2026-04-19T19:20:08.214Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq1q00058o01j6byvjxz",
        "code": "directory_admin_pl_internal",
        "name": "Directory Admin / PL Internal",
        "description": null,
        "role": "Directory Admin",
        "group": "PL Internal",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.222Z",
        "updatedAt": "2026-04-19T19:20:08.222Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq1t00078o01pf98wk2u",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "directory.admin.full",
                "createdAt": "2026-04-19T19:20:08.226Z",
                "permission": {
                    "uid": "directory.admin.full",
                    "code": "directory.admin.full",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.217Z",
                    "updatedAt": "2026-04-19T19:20:08.217Z"
                }
            },
            {
                "uid": "cmo65hq1w00088o01cy5f5gjh",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "team.search.read",
                "createdAt": "2026-04-19T19:20:08.229Z",
                "permission": {
                    "uid": "team.search.read",
                    "code": "team.search.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.218Z",
                    "updatedAt": "2026-04-19T19:20:08.218Z"
                }
            },
            {
                "uid": "cmo65hq1y000a8o01hhvtqqff",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "team.priority.read",
                "createdAt": "2026-04-19T19:20:08.231Z",
                "permission": {
                    "uid": "team.priority.read",
                    "code": "team.priority.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.219Z",
                    "updatedAt": "2026-04-19T19:20:08.219Z"
                }
            },
            {
                "uid": "cmo65hq20000c8o01eq36qx00",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "membership.source.read",
                "createdAt": "2026-04-19T19:20:08.233Z",
                "permission": {
                    "uid": "membership.source.read",
                    "code": "membership.source.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.220Z",
                    "updatedAt": "2026-04-19T19:20:08.220Z"
                }
            },
            {
                "uid": "cmo65hq27000e8o01a167xw24",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "admin.tools.access",
                "createdAt": "2026-04-19T19:20:08.239Z",
                "permission": {
                    "uid": "admin.tools.access",
                    "code": "admin.tools.access",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.221Z",
                    "updatedAt": "2026-04-19T19:20:08.221Z"
                }
            },
            {
                "uid": "cmo65hq2a000f8o01oq2lukzv",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "founder_guides.view.all",
                "createdAt": "2026-04-19T19:20:08.243Z",
                "permission": {
                    "uid": "founder_guides.view.all",
                    "code": "founder_guides.view.all",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.192Z",
                    "updatedAt": "2026-04-19T19:20:08.192Z"
                }
            },
            {
                "uid": "cmo65hq2d000g8o01hbkatbqf",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.245Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            },
            {
                "uid": "cmo65hq2e000h8o01sv0d3ria",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.247Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq2g000i8o015iboohqo",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.248Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq2h000j8o01dlc2zy97",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.250Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq2i000k8o01pouvbgda",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.251Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq2k000m8o017ou401bo",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.252Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq2l000n8o0109gfimom",
                "policyUid": "cmo65hq1q00058o01j6byvjxz",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.254Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq4g002u8o011x290n4o",
        "code": "founder_plc_crypto",
        "name": "Founder / PLC Crypto",
        "description": null,
        "role": "Founder",
        "group": "PLC Crypto",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.321Z",
        "updatedAt": "2026-04-19T19:20:08.321Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq4h002w8o01rfpqtalg",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.322Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq4i002y8o019fzqrpnm",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.323Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq4j002z8o01qhg0m8lx",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.324Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq4k00308o01axotx6q4",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.325Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq4m00328o016qqvfdpx",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.327Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq4p00348o01rg0wrr3a",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.330Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq4q00368o01dwiqajtn",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.331Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq4r00378o01uahhoyup",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.332Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq4s00388o01bf2mqcu3",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.333Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq4u003a8o01fnk39beb",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.334Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            },
            {
                "uid": "cmo65hq4v003b8o01oqynecyn",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "founder_guides.view.plcc",
                "createdAt": "2026-04-19T19:20:08.335Z",
                "permission": {
                    "uid": "founder_guides.view.plcc",
                    "code": "founder_guides.view.plcc",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.172Z",
                    "updatedAt": "2026-04-19T19:20:08.172Z"
                }
            },
            {
                "uid": "cmo65hq4w003d8o018xcoxzvz",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.336Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq4x003f8o013e7o806d",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "demoday.prep.write",
                "createdAt": "2026-04-19T19:20:08.337Z",
                "permission": {
                    "uid": "demoday.prep.write",
                    "code": "demoday.prep.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.206Z",
                    "updatedAt": "2026-04-19T19:20:08.206Z"
                }
            },
            {
                "uid": "cmo65hq4y003g8o01vsroncib",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.338Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq4z003h8o01kw3sjmzc",
                "policyUid": "cmo65hq4g002u8o011x290n4o",
                "permissionUid": "demoday.active.write",
                "createdAt": "2026-04-19T19:20:08.340Z",
                "permission": {
                    "uid": "demoday.active.write",
                    "code": "demoday.active.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.213Z",
                    "updatedAt": "2026-04-19T19:20:08.213Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq50003i8o011p1xd6lw",
        "code": "founder_plc_founder_forge",
        "name": "Founder / PLC Founder Forge",
        "description": null,
        "role": "Founder",
        "group": "PLC Founder Forge",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.340Z",
        "updatedAt": "2026-04-19T19:20:08.340Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq51003k8o01c21b4nej",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.342Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq54003m8o01p19xsnlf",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.344Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq55003n8o013yrovwjt",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.345Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq56003p8o01rybpslko",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.346Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq57003q8o01h03i7mp0",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.348Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq58003r8o01xrqioezl",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.349Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq59003s8o017rwr9cqw",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.350Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq5a003u8o01fb126q6u",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.351Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq5c003v8o01khh35xp4",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.352Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq5d003w8o012ro37wg8",
                "policyUid": "cmo65hq50003i8o011p1xd6lw",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.353Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq5e003x8o0156vf7dko",
        "code": "founder_plc_neuro",
        "name": "Founder / PLC Neuro",
        "description": null,
        "role": "Founder",
        "group": "PLC Neuro",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.354Z",
        "updatedAt": "2026-04-19T19:20:08.354Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq5f00408o01sol8527e",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.355Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq5g00418o011yygpwl6",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.356Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq5h00438o015nkcw36q",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.357Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq5i00458o01g0vzzxqt",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.358Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq5j00468o01cs7izrqy",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.359Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq5k00488o019detj7jr",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.360Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq5l00498o01vfpvyn1p",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.362Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq5m004b8o01i0z5sxrg",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.363Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq5n004d8o01x4n09pn6",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.364Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq5o004e8o0123a5l2yi",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.365Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq5p004f8o01q822ocg3",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "demoday.prep.write",
                "createdAt": "2026-04-19T19:20:08.366Z",
                "permission": {
                    "uid": "demoday.prep.write",
                    "code": "demoday.prep.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.206Z",
                    "updatedAt": "2026-04-19T19:20:08.206Z"
                }
            },
            {
                "uid": "cmo65hq5q004h8o01vfy9jtmd",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.367Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq5r004i8o0117wte2a6",
                "policyUid": "cmo65hq5e003x8o0156vf7dko",
                "permissionUid": "demoday.active.write",
                "createdAt": "2026-04-19T19:20:08.368Z",
                "permission": {
                    "uid": "demoday.active.write",
                    "code": "demoday.active.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.213Z",
                    "updatedAt": "2026-04-19T19:20:08.213Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6400518o01anb27yq4",
        "code": "founder_plc_other",
        "name": "Founder / PLC Other",
        "description": null,
        "role": "Founder",
        "group": "PLC Other",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.381Z",
        "updatedAt": "2026-04-19T19:20:08.381Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6500538o01fxh4iewd",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.382Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6600558o01zifg1n2t",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.382Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq6700568o01jnls7igf",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.383Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq6700578o01gyv1b60c",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.384Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq6800588o01h00aodm3",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.385Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq6900598o01k092u2t4",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.385Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq69005b8o01ik23v3w3",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.386Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq6a005c8o018cmkl0f1",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.387Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq6b005d8o01ez0ybdez",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.388Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq6c005e8o01eil183js",
                "policyUid": "cmo65hq6400518o01anb27yq4",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.389Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq3v00298o015jmhjexm",
        "code": "founder_plc_plvs",
        "name": "Founder / PLC PLVS",
        "description": null,
        "role": "Founder",
        "group": "PLC PLVS",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.300Z",
        "updatedAt": "2026-04-19T19:20:08.300Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq3x002c8o01o0ykjxtk",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.301Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq3y002d8o01n9ubplo2",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.303Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq40002e8o017l4471zx",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.304Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq41002f8o013h9u35j2",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.305Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq42002g8o01g77sj3ii",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.307Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq44002h8o01j9iy2d8f",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.309Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq46002j8o01orxlrbkz",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.311Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq47002l8o01a4kqg4x4",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.312Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq48002m8o01erp6whyy",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.313Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq4a002n8o01jyocdcv6",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.314Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            },
            {
                "uid": "cmo65hq4b002o8o01bolpuqbu",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "founder_guides.view.plvs",
                "createdAt": "2026-04-19T19:20:08.315Z",
                "permission": {
                    "uid": "founder_guides.view.plvs",
                    "code": "founder_guides.view.plvs",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.158Z",
                    "updatedAt": "2026-04-19T19:20:08.158Z"
                }
            },
            {
                "uid": "cmo65hq4c002p8o01x73okrcx",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "demoday.prep.read",
                "createdAt": "2026-04-19T19:20:08.316Z",
                "permission": {
                    "uid": "demoday.prep.read",
                    "code": "demoday.prep.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.205Z",
                    "updatedAt": "2026-04-19T19:20:08.205Z"
                }
            },
            {
                "uid": "cmo65hq4d002q8o0134xz5r8u",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "demoday.prep.write",
                "createdAt": "2026-04-19T19:20:08.317Z",
                "permission": {
                    "uid": "demoday.prep.write",
                    "code": "demoday.prep.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.206Z",
                    "updatedAt": "2026-04-19T19:20:08.206Z"
                }
            },
            {
                "uid": "cmo65hq4e002r8o019zcczjac",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.318Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            },
            {
                "uid": "cmo65hq4f002t8o017457dez8",
                "policyUid": "cmo65hq3v00298o015jmhjexm",
                "permissionUid": "demoday.active.write",
                "createdAt": "2026-04-19T19:20:08.320Z",
                "permission": {
                    "uid": "demoday.active.write",
                    "code": "demoday.active.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.213Z",
                    "updatedAt": "2026-04-19T19:20:08.213Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq5s004j8o01lsulvrkc",
        "code": "founder_pln_close_contributor",
        "name": "Founder / PLN Close Contributor",
        "description": null,
        "role": "Founder",
        "group": "PLN Close Contributor",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.368Z",
        "updatedAt": "2026-04-19T19:20:08.368Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq5t004m8o01mh5ki43l",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.370Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq5u004n8o0140henmpo",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.371Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq5v004p8o01w8swczoq",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.372Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq5w004r8o01wz9e801x",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.373Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq5x004s8o01eacagz8e",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.374Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq5y004u8o0166h00j33",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.375Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq5z004w8o01jmpuf4ct",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.376Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq62004y8o01l4uoe6t6",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.378Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq63004z8o01vmlhwg60",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.379Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq6400508o01dlqm1jxa",
                "policyUid": "cmo65hq5s004j8o01lsulvrkc",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.380Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6d005f8o0122hm2y2k",
        "code": "founder_pln_other",
        "name": "Founder / PLN Other",
        "description": null,
        "role": "Founder",
        "group": "PLN Other",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.389Z",
        "updatedAt": "2026-04-19T19:20:08.389Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6d005h8o01z0nzgb9b",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.390Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6e005i8o010dhb4xke",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.390Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq6f005k8o01i4wx73s7",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.391Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq6f005l8o015epn9f71",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.392Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq6g005n8o01dprft4gp",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.392Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq6h005o8o015mm69373",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.393Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq6h005q8o01tfmf5gyj",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.394Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq6i005s8o013cjnewph",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.394Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq6j005u8o01cx6tyhzl",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.395Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq6j005v8o01hdlvz9nn",
                "policyUid": "cmo65hq6d005f8o0122hm2y2k",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.396Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6k005w8o0162poqnam",
        "code": "investor_pl",
        "name": "Investor / PL",
        "description": null,
        "role": "Investor",
        "group": "PL",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.396Z",
        "updatedAt": "2026-04-19T19:20:08.396Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6k005z8o01u177a7eg",
                "policyUid": "cmo65hq6k005w8o0162poqnam",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.397Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6l00618o017avv3an3",
                "policyUid": "cmo65hq6k005w8o0162poqnam",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.398Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq6m00628o01rl7j2jlx",
                "policyUid": "cmo65hq6k005w8o0162poqnam",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.398Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq6m00638o01j38wqc0w",
                "policyUid": "cmo65hq6k005w8o0162poqnam",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.399Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6n00648o019edtzq9u",
        "code": "investor_pl_partner",
        "name": "Investor / PL Partner",
        "description": null,
        "role": "Investor",
        "group": "PL Partner",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.399Z",
        "updatedAt": "2026-04-19T19:20:08.399Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6o00668o013yiafvnb",
                "policyUid": "cmo65hq6n00648o019edtzq9u",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.400Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6o00678o01ln2y2a20",
                "policyUid": "cmo65hq6n00648o019edtzq9u",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.401Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq6p00698o013dllq5ax",
                "policyUid": "cmo65hq6n00648o019edtzq9u",
                "permissionUid": "demoday.active.read",
                "createdAt": "2026-04-19T19:20:08.401Z",
                "permission": {
                    "uid": "demoday.active.read",
                    "code": "demoday.active.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.212Z",
                    "updatedAt": "2026-04-19T19:20:08.212Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq2m000o8o01muvnjdmm",
        "code": "pl_infra_team_pl_internal",
        "name": "PL Infra Team / PL Internal",
        "description": null,
        "role": "PL Infra team",
        "group": "PL Internal",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.255Z",
        "updatedAt": "2026-04-19T19:20:08.255Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq2o000q8o01h33c20c1",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "team.priority.read",
                "createdAt": "2026-04-19T19:20:08.257Z",
                "permission": {
                    "uid": "team.priority.read",
                    "code": "team.priority.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.219Z",
                    "updatedAt": "2026-04-19T19:20:08.219Z"
                }
            },
            {
                "uid": "cmo65hq2p000r8o01n39i59qo",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "membership.source.read",
                "createdAt": "2026-04-19T19:20:08.258Z",
                "permission": {
                    "uid": "membership.source.read",
                    "code": "membership.source.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.220Z",
                    "updatedAt": "2026-04-19T19:20:08.220Z"
                }
            },
            {
                "uid": "cmo65hq2r000s8o012e9md4ul",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "founder_guides.view.all",
                "createdAt": "2026-04-19T19:20:08.259Z",
                "permission": {
                    "uid": "founder_guides.view.all",
                    "code": "founder_guides.view.all",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.192Z",
                    "updatedAt": "2026-04-19T19:20:08.192Z"
                }
            },
            {
                "uid": "cmo65hq2s000u8o01e3n54vsd",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "deals.read",
                "createdAt": "2026-04-19T19:20:08.260Z",
                "permission": {
                    "uid": "deals.read",
                    "code": "deals.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.195Z",
                    "updatedAt": "2026-04-19T19:20:08.195Z"
                }
            },
            {
                "uid": "cmo65hq2t000w8o01k7chsxpb",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.262Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq2v000y8o017ac1xfz5",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.263Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            },
            {
                "uid": "cmo65hq2w000z8o01e1f3s7nf",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.265Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq2x00118o01l2sogp92",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.266Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq2z00128o01jhegub0i",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.267Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq3000138o01zqislukh",
                "policyUid": "cmo65hq2m000o8o01muvnjdmm",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.269Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6w006p8o01h9x7os2s",
        "code": "unassigned_plc_crypto",
        "name": "Unassigned / PLC Crypto",
        "description": null,
        "role": "Unassigned",
        "group": "PLC Crypto",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.409Z",
        "updatedAt": "2026-04-19T19:20:08.409Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6x006r8o0196wd2qh5",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.409Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6y006t8o01ioffhlfa",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.410Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq6y006v8o01pq4uedrv",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.411Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq6z006w8o01survqr6u",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.411Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq70006x8o01el0d4s13",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.412Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq70006y8o01cmy6bzyx",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.413Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq71006z8o01krh51tbs",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.413Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq7200718o01bhocxf1f",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.414Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq7200728o01v03tjsf7",
                "policyUid": "cmo65hq6w006p8o01h9x7os2s",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.415Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq7300738o01k9tbvugd",
        "code": "unassigned_plc_founder_forge",
        "name": "Unassigned / PLC Founder Forge",
        "description": null,
        "role": "Unassigned",
        "group": "PLC Founder Forge",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.415Z",
        "updatedAt": "2026-04-19T19:20:08.415Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7300758o019g3ws0jo",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.416Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7400768o01oci9wlfl",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.417Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq7500778o013n978zdg",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.417Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq7500798o0130q80sy0",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.418Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq76007a8o01zig8c1x5",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.419Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq77007b8o01l8jkp1gc",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.419Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq78007d8o01nvpldvqh",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.420Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq78007f8o019l0ecep7",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.421Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq79007g8o011wdko1wp",
                "policyUid": "cmo65hq7300738o01k9tbvugd",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.422Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq7a007h8o010o9lwqjc",
        "code": "unassigned_plc_neuro",
        "name": "Unassigned / PLC Neuro",
        "description": null,
        "role": "Unassigned",
        "group": "PLC Neuro",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.422Z",
        "updatedAt": "2026-04-19T19:20:08.422Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7b007k8o01bine4umd",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.423Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7b007m8o012m4gurnv",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.424Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq7c007o8o01fjlf6ezv",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.425Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq7d007p8o01bfidpz5h",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.425Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq7e007q8o01m96l3lap",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.426Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq7e007r8o0127zsd7q0",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.427Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq7f007s8o01ykivxb8o",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.427Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq7g007t8o0106cjaoj4",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.428Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq7g007v8o01pi22a0bt",
                "policyUid": "cmo65hq7a007h8o010o9lwqjc",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.429Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq7t008m8o0106ds38t5",
        "code": "unassigned_plc_other",
        "name": "Unassigned / PLC Other",
        "description": null,
        "role": "Unassigned",
        "group": "PLC Other",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.441Z",
        "updatedAt": "2026-04-19T19:20:08.441Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7t008o8o0196012om5",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.442Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7u008p8o01nf6v3f3u",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.442Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq7v008q8o01cth69mho",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.443Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq7v008r8o0140qwekh2",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.444Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq7w008s8o011l3lgtwd",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.444Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq7x008t8o013zi91krq",
                "policyUid": "cmo65hq7t008m8o0106ds38t5",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.445Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq6p006a8o01f3uo4fvh",
        "code": "unassigned_plc_plvs",
        "name": "Unassigned / PLC PLVS",
        "description": null,
        "role": "Unassigned",
        "group": "PLC PLVS",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.402Z",
        "updatedAt": "2026-04-19T19:20:08.402Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq6q006c8o01r3h2xxha",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.403Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq6r006d8o01gty2tme3",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.403Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq6r006f8o01x793jmix",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.404Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq6s006g8o016ypr0s8w",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.405Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq6t006i8o010ioo428c",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.405Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq6u006j8o01k93wt4an",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.406Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq6v006l8o01o6b4p5hj",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.407Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq6v006n8o01ldmcz5bc",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.408Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq6w006o8o01zxiuk5y3",
                "policyUid": "cmo65hq6p006a8o01f3uo4fvh",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.408Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq7h007w8o01is4y0458",
        "code": "unassigned_pln_close_contributor",
        "name": "Unassigned / PLN Close Contributor",
        "description": null,
        "role": "Unassigned",
        "group": "PLN Close Contributor",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.429Z",
        "updatedAt": "2026-04-19T19:20:08.429Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7h007y8o015ugij5je",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.430Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7i00808o01dc3hxywt",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.431Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq7j00818o0157unkytt",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.431Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq7j00828o017bnsghhe",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.432Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq7k00838o01plabfen3",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.433Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq7l00858o01g4atsple",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.433Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            },
            {
                "uid": "cmo65hq7l00878o01dymfh82t",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "oh.demand.write",
                "createdAt": "2026-04-19T19:20:08.434Z",
                "permission": {
                    "uid": "oh.demand.write",
                    "code": "oh.demand.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.202Z",
                    "updatedAt": "2026-04-19T19:20:08.202Z"
                }
            },
            {
                "uid": "cmo65hq7n00898o01uylmz1e9",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "forum.read",
                "createdAt": "2026-04-19T19:20:08.435Z",
                "permission": {
                    "uid": "forum.read",
                    "code": "forum.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.197Z",
                    "updatedAt": "2026-04-19T19:20:08.197Z"
                }
            },
            {
                "uid": "cmo65hq7n008b8o016jb7lpjy",
                "policyUid": "cmo65hq7h007w8o01is4y0458",
                "permissionUid": "forum.write",
                "createdAt": "2026-04-19T19:20:08.436Z",
                "permission": {
                    "uid": "forum.write",
                    "code": "forum.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.198Z",
                    "updatedAt": "2026-04-19T19:20:08.198Z"
                }
            }
        ]
    },
    {
        "uid": "cmo65hq7o008c8o01hw2d0qn7",
        "code": "unassigned_pln_other",
        "name": "Unassigned / PLN Other",
        "description": null,
        "role": "Unassigned",
        "group": "PLN Other",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.436Z",
        "updatedAt": "2026-04-19T19:20:08.436Z",
        "policyPermissions": [
            {
                "uid": "cmo65hq7p008e8o0195buun26",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "member.contacts.read",
                "createdAt": "2026-04-19T19:20:08.437Z",
                "permission": {
                    "uid": "member.contacts.read",
                    "code": "member.contacts.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.215Z",
                    "updatedAt": "2026-04-19T19:20:08.215Z"
                }
            },
            {
                "uid": "cmo65hq7p008f8o01ey457ubb",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "irlg.going.read",
                "createdAt": "2026-04-19T19:20:08.438Z",
                "permission": {
                    "uid": "irlg.going.read",
                    "code": "irlg.going.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.203Z",
                    "updatedAt": "2026-04-19T19:20:08.203Z"
                }
            },
            {
                "uid": "cmo65hq7q008g8o01bwcmnrib",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "irlg.going.write",
                "createdAt": "2026-04-19T19:20:08.438Z",
                "permission": {
                    "uid": "irlg.going.write",
                    "code": "irlg.going.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.204Z",
                    "updatedAt": "2026-04-19T19:20:08.204Z"
                }
            },
            {
                "uid": "cmo65hq7r008i8o01xtxsqnfs",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "oh.supply.read",
                "createdAt": "2026-04-19T19:20:08.439Z",
                "permission": {
                    "uid": "oh.supply.read",
                    "code": "oh.supply.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.199Z",
                    "updatedAt": "2026-04-19T19:20:08.199Z"
                }
            },
            {
                "uid": "cmo65hq7r008j8o01cypd2ksu",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "oh.supply.write",
                "createdAt": "2026-04-19T19:20:08.440Z",
                "permission": {
                    "uid": "oh.supply.write",
                    "code": "oh.supply.write",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.200Z",
                    "updatedAt": "2026-04-19T19:20:08.200Z"
                }
            },
            {
                "uid": "cmo65hq7s008l8o01f4stiewj",
                "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
                "permissionUid": "oh.demand.read",
                "createdAt": "2026-04-19T19:20:08.440Z",
                "permission": {
                    "uid": "oh.demand.read",
                    "code": "oh.demand.read",
                    "description": "Seeded by access-control-v2 bootstrap",
                    "createdAt": "2026-04-19T19:20:08.201Z",
                    "updatedAt": "2026-04-19T19:20:08.201Z"
                }
            }
        ]
    }
]
```


## 2) Admin - Get policy by code

### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/policies/directory_admin_pl_internal' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' 

```

### Response

```json
{
    "uid": "cmo65hq1q00058o01j6byvjxz",
    "code": "directory_admin_pl_internal",
    "name": "Directory Admin / PL Internal",
    "description": null,
    "role": "Directory Admin",
    "group": "PL Internal",
    "isSystem": true,
    "permissions": [
        {
            "uid": "directory.admin.full",
            "code": "directory.admin.full",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "team.search.read",
            "code": "team.search.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "team.priority.read",
            "code": "team.priority.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "membership.source.read",
            "code": "membership.source.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "admin.tools.access",
            "code": "admin.tools.access",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "founder_guides.view.all",
            "code": "founder_guides.view.all",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "deals.read",
            "code": "deals.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "forum.read",
            "code": "forum.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "forum.write",
            "code": "forum.write",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "oh.supply.read",
            "code": "oh.supply.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "oh.supply.write",
            "code": "oh.supply.write",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "oh.demand.read",
            "code": "oh.demand.read",
            "description": "Seeded by access-control-v2 bootstrap"
        },
        {
            "uid": "oh.demand.write",
            "code": "oh.demand.write",
            "description": "Seeded by access-control-v2 bootstrap"
        }
    ],
    "assignments": [
        {
            "uid": "1",
            "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
            "assignedByUid": null,
            "createdAt": "2026-04-19T22:22:28.000Z",
            "member": {
                "uid": "cmnwqb9th0a3k7j3as9gtrgk7",
                "name": "Berta",
                "email": "nataliia.kr.job+7@gmail.com"
            }
        }
    ],
    "createdAt": "2026-04-19T19:20:08.222Z",
    "updatedAt": "2026-04-19T19:20:08.222Z"
}
```



## 3) Admin - Get member access


### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/members/cmnwqb9th0a3k7j3as9gtrgk7/access' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=xKrhHnZtRbvNp8EHaejHNw'

```


### Response

```json
{
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "policies": [
        {
            "uid": "1",
            "code": "directory_admin_pl_internal",
            "name": "Directory Admin / PL Internal",
            "role": "Directory Admin",
            "group": "PL Internal",
            "permissions": [
                "directory.admin.full",
                "team.search.read",
                "team.priority.read",
                "membership.source.read",
                "admin.tools.access",
                "founder_guides.view.all",
                "deals.read",
                "forum.read",
                "forum.write",
                "oh.supply.read",
                "oh.supply.write",
                "oh.demand.read",
                "oh.demand.write"
            ]
        }
    ],
    "directPermissions": [],
    "effectivePermissions": [
        "admin.tools.access",
        "deals.read",
        "directory.admin.full",
        "forum.read",
        "forum.write",
        "founder_guides.view.all",
        "membership.source.read",
        "oh.demand.read",
        "oh.demand.write",
        "oh.supply.read",
        "oh.supply.write",
        "team.priority.read",
        "team.search.read"
    ]
}
```


## 4) Admin - Assign policy


### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/assign-policy' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=iUGFJokR541QPZQoNzvtCw' \
--data '{
  "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
  "policyCode": "unassigned_pln_other",
  "assignedByUid": "cmnwqb9th0a3k7j3as9gtrgk7"
}'
```


### Response

```json
{
    "uid": "cmo6xki8k00028om09muu6exx",
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "policyUid": "cmo65hq7o008c8o01hw2d0qn7",
    "assignedByUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "createdAt": "2026-04-20T08:26:07.316Z",
    "updatedAt": "2026-04-20T09:24:34.402Z",
    "policy": {
        "uid": "cmo65hq7o008c8o01hw2d0qn7",
        "code": "unassigned_pln_other",
        "name": "Unassigned / PLN Other",
        "description": null,
        "role": "Unassigned",
        "group": "PLN Other",
        "isSystem": true,
        "createdAt": "2026-04-19T19:20:08.436Z",
        "updatedAt": "2026-04-19T19:20:08.436Z"
    }
}
```


## 5) Remove policy


### Request

```bash
curl --location --request DELETE 'http://localhost:3003/v2/admin/access-control-v2/members/cmnwqb9th0a3k7j3as9gtrgk7/policies/unassigned_pln_other' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=j4lb-trVDP6dcwCiOmCI_A'

```


### Response

```json
{
    "ok": true
}
```


## 6) Admin - Grant direct permission

### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/member-permissions' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=j4lb-trVDP6dcwCiOmCI_A' \
--data '{
  "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
  "permissionCode": "founder_guides.view.plvs",
  "grantedByUid": "cmnwqb9th0a3k7j3as9gtrgk7",
  "reason": "postman test"
}'
```


### Response

```json
{
    "uid": "cmo6zxuof00088om0h32efwh3",
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "permissionUid": "founder_guides.view.plvs",
    "grantedByUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "reason": "postman test",
    "createdAt": "2026-04-20T09:32:29.198Z",
    "updatedAt": "2026-04-20T09:32:29.198Z",
    "permission": {
        "uid": "founder_guides.view.plvs",
        "code": "founder_guides.view.plvs",
        "description": "Seeded by access-control-v2 bootstrap",
        "createdAt": "2026-04-19T19:20:08.158Z",
        "updatedAt": "2026-04-19T19:20:08.158Z"
    }
}
```



 ## 7) Admin - Revoke direct permission


### Request

```bash
curl --location --request DELETE 'http://localhost:3003/v2/admin/access-control-v2/members/cmnwqb9th0a3k7j3as9gtrgk7/direct-permissions/founder_guides.view.plvs' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=j4lb-trVDP6dcwCiOmCI_A'

```


### Response

```json
{
    "ok": true
}
```


## 8) My access

### Request

```bash
curl --location 'http://localhost:3003/v2/access-control-v2/me/access' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Im5hdGFsaWlhLmtyLmpvYis3QGdtYWlsLmNvbSIsImF1ZCI6WyJjbG9yaWcwbXcwNWxpb2RndmVsdHZyOHByIl0sImlhdCI6MTc3NjYyNTU2MywiZXhwIjoxNzg2OTkzNTYzLCJpc3MiOiJodHRwczovL2Rldi1hdXRoLnBsbmV0d29yay5pbyIsInN1YiI6ImNtbndxYjl0aDBhM2s3ajNhczlndHJrazciLCJqdGkiOiJmYWQ0NWIwNDBiMWQ4Zjc1OGYxZmVjYTlmYzdlYzFlZSJ9.EVpQ7fMQ98D8lPonhOAoObvqX05scJreiihvnkpvCFk' \
--header 'Cookie: _csrf=PU3JoocVNO9PNgrDCXUyFA'

```

### Response

```json
{
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "policies": [
        {
            "uid": "cmo661mpn00038oyv76d0ucv7",
            "code": "demo_day_admin_pl_partner",
            "name": "Demo Day Admin / PL Partner",
            "role": "Demo Day Admin",
            "group": "PL Partner",
            "permissions": [
                "demoday.prep.read",
                "demoday.prep.write",
                "demoday.showcase.read",
                "demoday.showcase.write",
                "demoday.active.read",
                "demoday.active.write",
                "demoday.stats.read"
            ]
        },
        {
            "uid": "1",
            "code": "directory_admin_pl_internal",
            "name": "Directory Admin / PL Internal",
            "role": "Directory Admin",
            "group": "PL Internal",
            "permissions": [
                "directory.admin.full",
                "team.search.read",
                "team.priority.read",
                "membership.source.read",
                "admin.tools.access",
                "founder_guides.view.all",
                "deals.read",
                "forum.read",
                "forum.write",
                "oh.supply.read",
                "oh.supply.write",
                "oh.demand.read",
                "oh.demand.write"
            ]
        },
        {
            "uid": "cmo6xk65m00018om03ouwts8k",
            "code": "unassigned_plc_plvs",
            "name": "Unassigned / PLC PLVS",
            "role": "Unassigned",
            "group": "PLC PLVS",
            "permissions": [
                "member.contacts.read",
                "irlg.going.read",
                "irlg.going.write",
                "oh.supply.read",
                "oh.supply.write",
                "oh.demand.read",
                "oh.demand.write",
                "forum.read",
                "forum.write"
            ]
        }
    ],
    "directPermissions": [
        "admin.tools.access",
        "founder_guides.view.plvs",
        "member.contacts.read"
    ],
    "effectivePermissions": [
        "admin.tools.access",
        "deals.read",
        "demoday.active.read",
        "demoday.active.write",
        "demoday.prep.read",
        "demoday.prep.write",
        "demoday.showcase.read",
        "demoday.showcase.write",
        "demoday.stats.read",
        "directory.admin.full",
        "forum.read",
        "forum.write",
        "founder_guides.view.all",
        "founder_guides.view.plvs",
        "irlg.going.read",
        "irlg.going.write",
        "member.contacts.read",
        "membership.source.read",
        "oh.demand.read",
        "oh.demand.write",
        "oh.supply.read",
        "oh.supply.write",
        "team.priority.read",
        "team.search.read"
    ]
}
```


## 9) Self - Has permission


### Request

```bash
curl --location 'http://localhost:3003/v2/access-control-v2/me/has-permission' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Im5hdGFsaWlhLmtyLmpvYis3QGdtYWlsLmNvbSIsImF1ZCI6WyJjbG9yaWcwbXcwNWxpb2RndmVsdHZyOHByIl0sImlhdCI6MTc3NjYyNTU2MywiZXhwIjoxNzg2OTkzNTYzLCJpc3MiOiJodHRwczovL2Rldi1hdXRoLnBsbmV0d29yay5pbyIsInN1YiI6ImNtbndxYjl0aDBhM2s3ajNhczlndHJrazciLCJqdGkiOiJmYWQ0NWIwNDBiMWQ4Zjc1OGYxZmVjYTlmYzdlYzFlZSJ9.EVpQ7fMQ98D8lPonhOAoObvqX05scJreiihvnkpvCFk' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=guS8_ZPN3KxLzCpT4gFBMA' \
--data '{
  "permissionCode": "founder_guides.view.all"
}'
```



### Response

```json
{
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "permissionCode": "founder_guides.view.all",
    "allowed": true
}
```


## 10) check access

### Request

```bash
curl --location 'http://localhost:3003/v2/debug/access-control-v2/has-permission' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=7g3f6qVjpcjt85I6fWxQdA' \
--data '{
  "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
  "permissionCode": "founder_guides.view.all"
}'
```


### Response

```json
{
    "memberUid": "cmnwqb9th0a3k7j3as9gtrgk7",
    "permissionCode": "founder_guides.view.all",
    "allowed": true
}
```


## 11) Admin - Create policy


### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/policies' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=7g3f6qVjpcjt85I6fWxQdA' \
--data '{
  "code": "postman_test_policy",
  "name": "Postman Test Policy",
  "role": "Test Role",
  "group": "Test Group",
  "description": "Created from Postman lllll"
}'
```




### Response

```json
{
    "statusCode": 409,
    "message": "Policy already exists: postman_test_policy"
}
```


if "ok" -> status 200

### Response

```json
{
    "uid": "cmo72zf8g00008o5vvlo3bru8",
    "code": "postman_test_policy",
    "name": "Postman Test Policy",
    "description": "Created from Postman lllll",
    "role": "Test Role",
    "group": "Test Group",
    "isSystem": false,
    "permissions": [],
    "assignments": [],
    "createdAt": "2026-04-20T10:57:41.345Z",
    "updatedAt": "2026-04-20T10:57:41.345Z"
}
```



## 12) Admin - Update policy


### Request

```bash
curl --location --request PATCH 'http://localhost:3003/v2/admin/access-control-v2/policies/postman_test_policy' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=7g3f6qVjpcjt85I6fWxQdA' \
--data '{
  "name": "Postman Test Policy Updated",
  "role": "Test Role",
  "group": "Test Group",
  "description": "Updated from Postman"
}'
```


### Response

```json
{
    "uid": "cmo6pslaz00008o77yt9blqdb",
    "code": "postman_test_policy",
    "name": "Postman Test Policy Updated",
    "description": "Updated from Postman",
    "role": "Test Role",
    "group": "Test Group",
    "isSystem": false,
    "permissions": [],
    "assignments": [],
    "createdAt": "2026-04-20T04:48:27.611Z",
    "updatedAt": "2026-04-20T10:06:27.302Z"
}
```


## 13) add permision to policy

### Request

```bash
curl --location 'http://localhost:3003/v2/admin/access-control-v2/policies/postman_test_policy/permissions' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Content-Type: application/json' \
--header 'Cookie: _csrf=7g3f6qVjpcjt85I6fWxQdA' \
--data '{
  "permissionCode": "deals.read"
}'
```


### Response

```json
{
    "uid": "cmo6pslaz00008o77yt9blqdb",
    "code": "postman_test_policy",
    "name": "Postman Test Policy Updated",
    "description": "Updated from Postman",
    "role": "Test Role",
    "group": "Test Group",
    "isSystem": false,
    "permissions": [
        {
            "uid": "deals.read",
            "code": "deals.read",
            "description": "Seeded by access-control-v2 bootstrap"
        }
    ],
    "assignments": [],
    "createdAt": "2026-04-20T04:48:27.611Z",
    "updatedAt": "2026-04-20T10:06:27.302Z"
}
```



## 14) Admin - Remove permission from policy

### Request

```bash
curl --location --request DELETE 'http://localhost:3003/v2/admin/access-control-v2/policies/postman_test_policy/permissions/deals.read' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=EolbfmPBpNNVzrvgil9bTg'

```

### Response

```json
{
    "removed": true
}
```


## 15) Admin - Delete policy


### Request

```bash
 curl --location --request DELETE 'http://localhost:3003/v2/admin/access-control-v2/policies/postman_test_policy' \
--header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJESVJFQ1RPUllBRE1JTiJdLCJtZW1iZXJVaWQiOiJjbW53cWI5dGgwYTNrN2ozYXM5Z3RyZ2s3IiwiZXhwIjoxNzc5MjU1MDgzLCJpYXQiOjE3NzY2NjMwODN9.6UGXRbdbB8ITNWbloDzNNtLWp2X4eXC3KXDHWrlWJ5Q' \
--header 'Cookie: _csrf=EolbfmPBpNNVzrvgil9bTg'

```

### Response

```json
{
    "ok": true
}
```





