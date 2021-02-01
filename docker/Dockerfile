FROM ubuntu:20.04

# author =====================
LABEL version="1.0"
LABEL maintainer="tsungtatsai@iii.org.tw"

# set system env =======================
ENV DEBIAN_FRONTEND=noninteractive

#  basic utils (use 'apt-get', instead of 'apt' for CLI)
RUN apt-get update && apt-get install -y \
        tzdata locales \
        wget curl iputils-ping

#ENV TZ Asia/Taipei (after tzdata is installed)
RUN ln -sf /usr/share/zoneinfo/Asia/Taipei /etc/localtime && \
        echo "Asia/Taipei" > /etc/timezone

ENV LANG=en_US.UTF-8
RUN locale-gen $LANG && dpkg-reconfigure locales

# app dep ================
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get update && apt-get install -y \
        nodejs docker-compose

RUN wget https://github.com/mikefarah/yq/releases/download/v4.4.0/yq_linux_amd64 -O /usr/bin/yq && chmod +x /usr/bin/yq

# main app =========================================

ARG APP_HOME
ARG APP_HASH

COPY files/_app_ files/config.json "$APP_HOME/"
RUN cd "$APP_HOME" && npm install

# allow user to map commands to /root/bin
ENV PATH="/root/bin:$PATH"

# start ============================================
EXPOSE 4128
WORKDIR "$APP_HOME"
ENTRYPOINT npm start

