"""
语音活动检测 (VAD) — 抽象基类 + 状态枚举
"""
from abc import ABC, abstractmethod
from enum import Enum


class VADState(Enum):
    """VAD 状态"""
    SILENCE = "silence"           # 静音
    SPEECH_START = "speech_start"  # 边缘触发：刚检测到语音
    SPEECH = "speech"             # 持续语音
    SPEECH_END = "speech_end"     # 边缘触发：刚结束语音


class VAD(ABC):
    """语音活动检测器抽象基类

    每次调用 process() 处理一个音频块，返回当前 VAD 状态。
    SPEECH_START 和 SPEECH_END 只在状态转换时刻返回一次。
    """

    @abstractmethod
    def process(self, chunk: bytes) -> VADState:
        """处理一个音频块
你这样直接写死容量限制会不会有
你这样直接写死容量限制会不会有问
你这样直接写死容量限制会不会有问


        Args:
            chunk: PCM 16-bit LE 音频数据

        Returns:
            当前 VAD 状态
        """

    @abstractmethod
    def reset(self) -> None:
        """重置内部状态（重新估计噪声底噪）"""

    @property
    @abstractmethod
    def noise_floor(self) -> float:
        """当前估计的噪声底噪"""


# ═══ 工具函数 ═══

def compute_rms(chunk: bytes, sample_width: int = 2) -> float:
    """计算 PCM 音频块的 RMS

    Args:
        chunk: 原始字节
        sample_width: 采样位宽（字节），默认 2（16-bit）

    Returns:
        RMS 值
    """
    import math
    import struct

    count = len(chunk) // sample_width
    if count == 0:
        return 0.0

    fmt = {1: "B", 2: "h", 4: "i"}[sample_width]
    sum_sq = 0.0
    for i in range(0, len(chunk), sample_width):
        sample = struct.unpack(fmt, chunk[i : i + sample_width])[0]
        sum_sq += sample * sample

    return math.sqrt(sum_sq / count)
