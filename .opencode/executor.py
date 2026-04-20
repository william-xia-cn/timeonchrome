#!/usr/bin/env python3
"""
Executor - 使用 DeepSeek 生成/修复代码
"""

import os
import json
from typing import Optional


class DeepSeekExecutor:
    """DeepSeek 代码执行器"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('DEEPSEEK_API_KEY')
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY not set")
        
        self.model = "deepseek-chat"
        self.max_tokens = 6000
        self.temperature = 0.2
    
    def run(self, context: str, task: str) -> str:
        """
        执行代码生成任务
        
        Args:
            context: 代码上下文（来自 Context Router）
            task: 具体任务描述
            
        Returns:
            生成的代码
        """
        prompt = self._build_prompt(context, task)
        
        # 调用 DeepSeek API
        # response = self._call_api(prompt)
        # return response
        
        # 模拟返回（实际实现需要集成 API）
        return f"// Generated code for: {task}\n// Context length: {len(context)} chars\n"
    
    def _build_prompt(self, context: str, task: str) -> str:
        """构建提示词"""
        return f"""你是高级软件工程师，请基于以下代码完成任务。

【代码上下文】
{context}

【任务】
{task}

要求：
- 只输出修改后的代码或新增代码
- 不要解释思路，直接给结果
- 保持原有代码风格和缩进
- 确保语法正确
- 如果是修改，用注释标记改动位置

输出格式：
```javascript
// 修改后的代码
```
"""


def run_executor(executor_client, context: str, task: str) -> str:
    """
    外部调用接口
    
    Args:
        executor_client: DeepSeek 客户端实例
        context: 代码上下文
        task: 任务描述
        
    Returns:
        生成的代码
    """
    return executor_client.run(context, task)


if __name__ == '__main__':
    # 测试
    executor = DeepSeekExecutor()
    test_context = "// test code\nfunction test() {}"
    test_task = "添加参数校验"
    result = executor.run(test_context, test_task)
    print(result)
