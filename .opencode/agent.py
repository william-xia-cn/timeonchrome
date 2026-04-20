#!/usr/bin/env python3
"""
Agent Loop - OpenCode MVP 主循环
Plan (Kimi) → Build (DeepSeek)
"""

import subprocess
from context_router import build_context, TimeOnChromeRouter
from executor import DeepSeekExecutor


class OpenCodeAgent:
    """OpenCode MVP Agent"""
    
    def __init__(self, project_root: str = '..'):
        self.project_root = project_root
        self.router = TimeOnChromeRouter(project_root)
        self.executor = DeepSeekExecutor()
        self.max_retries = 3
    
    def run(self, task: str) -> str:
        """
        运行完整任务
        
        Args:
            task: 用户任务描述
            
        Returns:
            执行结果
        """
        print(f"📝 Task: {task}")
        
        for step in range(self.max_retries):
            print(f"\n🔄 Step {step + 1}/{self.max_retries}")
            
            # 1. Plan: 提取上下文
            print("  [Plan] Extracting context...")
            context = self.router.extract_context(task)
            print(f"  Context: {len(context.split(chr(10)))} lines")
            
            # 2. Build: 生成代码
            print("  [Build] Generating code...")
            result = self.executor.run(context, task)
            
            # 3. 验证（可选）
            if self._verify(result):
                print("  ✅ Verified")
                return result
            
            # 4. 重试
            task = f"修复以下问题：\n{result}"
        
        return result
    
    def _verify(self, result: str) -> bool:
        """验证结果"""
        # 检查是否有错误标记
        error_markers = ['ERROR', 'exception', 'failed', 'undefined']
        return not any(marker in result.lower() for marker in error_markers)
    
    def run_test(self) -> bool:
        """运行测试套件"""
        try:
            result = subprocess.run(
                ['node', 'tests/run-all.js'],
                capture_output=True,
                text=True,
                timeout=120
            )
            return result.returncode == 0
        except Exception as e:
            print(f"Test error: {e}")
            return False


def main():
    """CLI 入口"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python agent.py <task>")
        print("Example: python agent.py '修复学习模式拦截'")
        sys.exit(1)
    
    task = sys.argv[1]
    agent = OpenCodeAgent()
    result = agent.run(task)
    
    print("\n" + "="*50)
    print("RESULT:")
    print(result)


if __name__ == '__main__':
    main()
