# Canva Connect Integration Guide

This guide explains how to set up the Canva Connect API integration for TitiLINKS, allowing users to design custom header images and wallpapers directly in Canva.

## Overview

TitiLINKS uses **Canva Connect API** (OAuth-based) to let users:
1. Click "Design on Canva" in the TitiLINKS editor
2. Create/edit designs in Canva's familiar interface
3. Export finished designs back to TitiLINKS

> ⚠️ **Important**: This is a **Connect API** integration, NOT a Canva Apps SDK integration. Do NOT use "Your apps" or upload JavaScript bundles.

## Setup Instructions

### Step 1: Access Canva Developer Portal

1. Go to [Canva Developer Portal](https://www.canva.com/developers/)
2. Sign in with your Canva account
3. Click **"Your integrations"** in the top navigation (NOT "Your apps")

### Step 2: Create a New Integration

1. Click **"Create an integration"**
2. Enter integration details:
   - **Name**: TitiLINKS
   - **Description**: Design custom headers and wallpapers for your TitiLINKS profile

### Step 3: Configure Authentication

In the Authentication settings:

1. **Redirect URL**: 
   ```
   https://titilinks.lovable.app/api/canva/callback
   ```

2. **Scopes** (select these):
   - `design:meta:read` - Read design metadata
   - `design:content:read` - Read and export design content

### Step 4: Copy Credentials

After creating the integration, copy:
- **Client ID**
- **Client Secret**

### Step 5: Add to Lovable Environment

Add these as secrets in your Lovable Cloud backend:
- `CANVA_CLIENT_ID` - Your Canva Client ID
- `CANVA_CLIENT_SECRET` - Your Canva Client Secret

## What NOT to Do

❌ Do NOT go to "Your apps" section  
❌ Do NOT upload JavaScript bundles  
❌ Do NOT configure "Development URL"  
❌ Do NOT create translation files  
❌ Do NOT use the Apps SDK documentation  

## Design Types Supported

- **Header Image**: 1200x400px banner for profile top
- **Wallpaper**: Full-page background image

## User Flow

1. User clicks "Design with Canva" button in TitiLINKS editor
2. User is redirected to Canva to authorize the connection
3. User creates or selects a design in Canva
4. User exports the design back to TitiLINKS
5. Image is saved to the user's profile

## Technical Implementation

The integration uses:
- OAuth 2.0 authorization code flow
- Canva Connect REST API for design export
- Edge function for secure token exchange

## Resources

- [Canva Connect API Documentation](https://www.canva.dev/docs/connect/)
- [Canva Developer Portal](https://www.canva.com/developers/)
