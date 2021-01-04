FROM ubuntu:20.04

# author =====================
LABEL version="1.0"
LABEL maintainer="tsungtatsai@iii.org.tw"

# set system env =======================
ENV DEBIAN_FRONTEND=noninteractive

#  basic utils (use 'apt-get', instead of 'apt' for CLI)
RUN apt-get update && apt-get install -y \
        tzdata locales \
        curl iputils-ping git nodejs npm

#ENV TZ Asia/Taipei (after tzdata is installed)
RUN ln -sf /usr/share/zoneinfo/Asia/Taipei /etc/localtime && \
        echo "Asia/Taipei" > /etc/timezone

ENV LANG=en_US.UTF-8
RUN locale-gen $LANG && dpkg-reconfigure locales

# more dep ================
RUN apt-get update && apt-get install -y \
        docker-compose

# main app =========================================

ARG APP_HOME

ARG GIT_HASH
RUN git clone --depth=1 --branch="master" "https://github.com/dayanuyim/taskman.git" "$APP_HOME" && \
    rm -rf "$APP_HOME/.git" "$APP_HOME/docker" 
COPY files "$APP_HOME"
RUN cd "$APP_HOME" && npm install

# allow user to map commands to /root/bin
ENV PATH="/root/bin:$PATH"

# start ============================================
WORKDIR "$APP_HOME"
ENTRYPOINT npm start

