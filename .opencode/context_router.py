#!/usr/bin/env python3
"""
Context Router - 使用 Kimi 裁剪代码上下文
针对 TimeOnChrome 项目优化
"""

import os
import json
from typing import List, Dict, Tuple


class TimeOnChromeRouter:
    """TimeOnChrome 专用代码路由器"""
    
    # 关键词 → 文件映射
    KEYWORD_MAP = {
        'block': ['background.js:1748-1814', 'rules/block_rules.json'],
        '拦截': ['background.js:1748-1814'],
        'study_mode': ['background.js:1780-1787'],
        '学习模式': ['background.js:1780-1787'],
        'bind': ['bind.html', 'auth.js', 'config.js', 'background.js:2183-2208'],
        '登录': ['bind.html', 'auth.js', 'config.js'],
        'device_token': ['auth.js', 'config.js', 'sync.js'],
        'sync': ['sync.js', 'background.js:140-410', 'background.js:412-445'],
        'cloud': ['sync.js', 'auth.js', 'config.js', 'background.js:140-192'],
        'quota': ['background.js:1816-1870', 'background.js:194-237'],
        'config': ['config.js', 'background.js:510-550'],
    }
    
    def __init__(self, project_root: str = '.'):
        self.project_root = project_root
        self.opencode_config = self._load_config()
    
    def _load_config(self) -> dict:
        """加载 opencode.json 配置"""
        config_path = os.path.join(self.project_root, '.opencode', 'opencode.json')
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    
    def extract_context(self, query: str, max_lines: int = 200) -> str:
        """
        根据查询提取相关代码上下文
        
        Args:
            query: 用户查询（如"修复学习模式拦截"）
            max_lines: 最大返回行数
            
        Returns:
            裁剪后的代码文本
        """
        # 1. 匹配关键词
        matched_files = self._match_keywords(query)
        
        # 2. 提取代码片段
        context_parts = []
        for file_ref in matched_files[:3]:  # 最多3个文件
            content = self._extract_file_section(file_ref)
            if content:
                context_parts.append(f"// === {file_ref} ===\n{content}")
        
        # 3. 合并并截断
        context = '\n\n'.join(context_parts)
        lines = context.split('\n')
        if len(lines) > max_lines:
            context = '\n'.join(lines[:max_lines]) + '\n// ... (truncated)'
        
        return context
    
    def _match_keywords(self, query: str) -> List[str]:
        """匹配关键词到文件"""
        query_lower = query.lower()
        matched = set()
        
        for keyword, files in self.KEYWORD_MAP.items():
            if keyword in query_lower:
                matched.update(files)
        
        return list(matched) if matched else ['background.js:1748-1814']
    
    def _extract_file_section(self, file_ref: str) -> str:
        """提取文件的指定行范围"""
        if ':' in file_ref:
            filepath, line_range = file_ref.split(':')
            start, end = map(int, line_range.split('-'))
        else:
            filepath = file_ref
            start, end = 1, 50  # 默认前50行
        
        full_path = os.path.join(self.project_root, 'timeonchrome', filepath)
        
        if not os.path.exists(full_path):
            return f"// File not found: {filepath}"
        
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                section = lines[start-1:end]
                return ''.join(section)
        except Exception as e:
            return f"// Error reading {filepath}: {e}"


def build_context(kimi_client, codebase_root: str, query: str) -> str:
    """
    外部调用接口 - 构建上下文
    
    Args:
        kimi_client: Kimi API 客户端
        codebase_root: 代码库根目录
        query: 查询字符串
        
    Returns:
        裁剪后的上下文
    """
    router = TimeOnChromeRouter(codebase_root)
    
    # 使用路由器提取相关代码
    context = router.extract_context(query)
    
    # 可选：使用 Kimi 进一步裁剪（如果需要）
    # context = kimi_client.optimize_context(context, query)
    
    return context


if __name__ == '__main__':
    # 测试
    router = TimeOnChromeRouter('..')
    test_query = "修复学习模式拦截失效"
    context = router.extract_context(test_query)
    print(f"Query: {test_query}")
    print(f"Context length: {len(context.split(chr(10)))} lines")
    print(context[:500])
