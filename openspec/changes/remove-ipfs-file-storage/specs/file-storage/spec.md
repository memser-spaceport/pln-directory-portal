# Spec Delta

## Purpose

Defines where the API stores uploaded images and files, so that storage behavior does not depend on legacy configuration and no file is written to public storage.

## ADDED Requirements

### Requirement: Uploads are stored in S3
The API SHALL store every uploaded image and file in S3, whatever the value of the legacy `FILE_STORAGE` setting. It SHALL NOT upload files to IPFS or any other public storage, and SHALL NOT transform the file bytes before upload.

#### Scenario: Image upload ignores legacy IPFS setting
- **WHEN** an image is uploaded and `FILE_STORAGE` is set to `ipfs`
- **THEN** the image is uploaded unchanged to the S3 image bucket and the returned URL is its S3 location

#### Scenario: Single-file upload returns an S3 URL
- **WHEN** a file is stored through the single-file upload helper
- **THEN** it is uploaded to the configured S3 upload bucket and the result reports storage `s3` with a signed URL by default

### Requirement: Upload records are written as S3
The API SHALL record every stored upload with storage `S3`, its bucket and key, and no IPFS content id.

#### Scenario: Upload record fields
- **WHEN** an upload is stored
- **THEN** its record has storage `S3`, the bucket and key used, and an empty `cid`
