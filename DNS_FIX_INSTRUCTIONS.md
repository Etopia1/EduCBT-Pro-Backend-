# Instructions to Change DNS to Google DNS (8.8.8.8)

## Method 1: Using PowerShell (Administrator Required)

1. Open PowerShell as Administrator
2. Run these commands:

```powershell
# Get your network adapter name
Get-NetAdapter

# Set DNS to Google DNS (replace "Ethernet" with your adapter name)
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses ("8.8.8.8","8.8.4.4")

# Or for Wi-Fi:
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("8.8.8.8","8.8.4.4")

# Flush DNS cache
ipconfig /flushdns
```

## Method 2: Using Windows Settings (GUI)

1. Open Settings → Network & Internet
2. Click on your connection (Wi-Fi or Ethernet)
3. Click "Edit" next to DNS server assignment
4. Select "Manual"
5. Turn on IPv4
6. Enter:
   - Preferred DNS: 8.8.8.8
   - Alternate DNS: 8.8.4.4
7. Click Save

## After Changing DNS:

Test if MongoDB Atlas is now reachable:
```bash
nslookup cluster0.x8ikutc.mongodb.net 8.8.8.8
```

Then restart your backend server.
