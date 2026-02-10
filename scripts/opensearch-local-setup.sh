#!/bin/bash
# Local OpenSearch setup script
# Creates indices with proper mappings for local development

OS_HOST="${OPENSEARCH_LOCAL_ENDPOINT:-http://localhost:9200}"

echo "Setting up OpenSearch indices at $OS_HOST..."

# Wait for OpenSearch to be ready
until curl -s "$OS_HOST" > /dev/null 2>&1; do
  echo "Waiting for OpenSearch..."
  sleep 2
done

echo "OpenSearch is ready!"

# Create member index
echo "Creating member index..."
curl -X PUT "$OS_HOST/member" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "uid": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "image": { "type": "keyword" },
      "bio": { "type": "text" },
      "scheduleMeetingCount": { "type": "integer" },
      "officeHoursUrl": { "type": "keyword" },
      "availableToConnect": { "type": "boolean" },
      "name_suggest": { "type": "completion" }
    }
  }
}'
echo ""

# Create team index
echo "Creating team index..."
curl -X PUT "$OS_HOST/team" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "uid": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "image": { "type": "keyword" },
      "shortDescription": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "longDescription": { "type": "text" },
      "name_suggest": { "type": "completion" },
      "shortDescription_suggest": { "type": "completion" }
    }
  }
}'
echo ""

# Create project index
echo "Creating project index..."
curl -X PUT "$OS_HOST/project" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "uid": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "image": { "type": "keyword" },
      "tagline": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "description": { "type": "text" },
      "readMe": { "type": "text" },
      "tags": { "type": "keyword" },
      "name_suggest": { "type": "completion" },
      "tagline_suggest": { "type": "completion" },
      "tags_suggest": { "type": "completion" }
    }
  }
}'
echo ""

# Create event index
echo "Creating event index..."
curl -X PUT "$OS_HOST/event" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "uid": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "image": { "type": "keyword" },
      "description": { "type": "text" },
      "additionalInfo": { "type": "text" },
      "shortDescription": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "location": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "slug": { "type": "keyword" },
      "slugCanonical": { "type": "keyword" },
      "eventUrl": { "type": "keyword" },
      "name_suggest": { "type": "completion" },
      "shortDescription_suggest": { "type": "completion" },
      "location_suggest": { "type": "completion" }
    }
  }
}'
echo ""

# Create forum_thread index
echo "Creating forum_thread index..."
curl -X PUT "$OS_HOST/forum_thread" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "uid": { "type": "keyword" },
      "tid": { "type": "integer" },
      "cid": { "type": "integer" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "topicTitle": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "topicSlug": { "type": "keyword" },
      "topicUrl": { "type": "keyword" },
      "categorySlug": { "type": "keyword" },
      "categoryUrl": { "type": "keyword" },
      "image": { "type": "keyword" },
      "replyCount": { "type": "integer" },
      "lastReplyAt": { "type": "date" },
      "rootPost": {
        "properties": {
          "pid": { "type": "integer" },
          "uidAuthor": { "type": "integer" },
          "content": { "type": "text" },
          "timestamp": { "type": "date" },
          "url": { "type": "keyword" },
          "cid": { "type": "integer" },
          "author": {
            "properties": {
              "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
              "username": { "type": "keyword" },
              "slug": { "type": "keyword" },
              "image": { "type": "keyword" }
            }
          }
        }
      },
      "replies": {
        "type": "nested",
        "properties": {
          "pid": { "type": "integer" },
          "uidAuthor": { "type": "integer" },
          "content": { "type": "text" },
          "timestamp": { "type": "date" },
          "url": { "type": "keyword" },
          "cid": { "type": "integer" },
          "author": {
            "properties": {
              "name": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
              "username": { "type": "keyword" },
              "slug": { "type": "keyword" },
              "image": { "type": "keyword" }
            }
          }
        }
      },
      "name_suggest": { "type": "completion" }
    }
  }
}'
echo ""

echo "Done! All indices created."
echo ""
echo "To verify, run: curl $OS_HOST/_cat/indices?v"
