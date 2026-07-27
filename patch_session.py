import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

old = """    try {
      const sessionData = { ...latestSessionRef.current };"""
new = """    try {
      const sessionData = { 
        ...latestSessionRef.current,
        sql: sqlRef.current,
        tabs: latestSessionRef.current.tabs.map(t => t.id === latestSessionRef.current.activeTabId ? { ...t, sql: sqlRef.current } : t)
      };"""

content = content.replace(old, new)

with open('src/App.tsx', 'w') as f:
    f.write(content)

